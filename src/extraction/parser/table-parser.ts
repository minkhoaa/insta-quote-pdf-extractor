import {
  type LineItem,
  type NumericBusinessField,
} from "@/domain/line-item";
import { type Evidence } from "@/domain/evidence";
import { type Refusal } from "@/domain/refusal";
import { type ExtractedPage } from "../pipeline";
import { validateLineItemEvidence } from "@/domain/validation";

export type RowClassification =
  | "HEADER"
  | "SEPARATOR"
  | "LINE_ITEM"
  | "SUMMARY_TOTAL"
  | "METADATA_OR_NOTE";

export interface DetectedTableHeader {
  headerLine: string;
  lineIndex: number;
  hasCode: boolean;
  hasDescription: boolean;
  hasQuantity: boolean;
  hasUnit: boolean;
  hasWeight: boolean;
  hasUnitPrice: boolean;
  hasAmount: boolean;
}

/**
 * Detects whether a table header exists on the page and identifies its columns.
 */
export function detectTableHeader(lines: string[]): DetectedTableHeader | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      /\bCode\b/i.test(line) &&
      (/\bDescription\b/i.test(line) || /\bQty\b/i.test(line))
    ) {
      return {
        headerLine: line,
        lineIndex: i,
        hasCode: /\bCode\b/i.test(line),
        hasDescription: /\bDescription\b/i.test(line),
        hasQuantity: /\bQty\b/i.test(line) || /\bQuantity\b/i.test(line),
        hasUnit: /\bUnit\b/i.test(line) && !/\bUnit\s+Price\b/i.test(line),
        hasWeight: /\bWeight\b/i.test(line) || /\bWt\b/i.test(line),
        hasUnitPrice: /\bUnit\s+Price\b/i.test(line) || /\bPrice\b/i.test(line),
        hasAmount: /\bAmount\b/i.test(line) || /\bTotal\b/i.test(line),
      };
    }
  }
  return null;
}

/**
 * Classifies a line of text into its semantic document role.
 */
export function classifyRow(line: string): RowClassification {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return "METADATA_OR_NOTE";
  }

  if (/^[-=_]{3,}$/.test(trimmed)) {
    return "SEPARATOR";
  }

  if (
    /\bCode\b/i.test(trimmed) &&
    (/\bDescription\b/i.test(trimmed) || /\bQty\b/i.test(trimmed))
  ) {
    return "HEADER";
  }

  if (
    /^(?:Subtotal|GST|Total|Payment due|Account copy|Total consignment weight):/i.test(
      trimmed
    )
  ) {
    return "SUMMARY_TOTAL";
  }

  // Line items start with an alphanumeric product/service code
  // e.g. FX-201, EL-902, RF-330, IN-045, CX-1000, AD-118, PL-114
  if (/^[A-Z]{2,4}-[0-9]{3,4}\b/.test(trimmed)) {
    return "LINE_ITEM";
  }

  return "METADATA_OR_NOTE";
}

/**
 * Tokenizes a candidate table row into structured line-item fields.
 *
 * Invariants:
 * 1. Strict conservative parsing — never derives missing amount from qty * unitPrice.
 * 2. Raw strings preserved verbatim (e.g. weights '20kg', '640g total').
 */
export function tokenizeCandidateRow(
  rawLine: string,
  pageNumber: number,
  method: "native" | "ocr",
  confidence?: number
): LineItem | null {
  const trimmed = rawLine.trim();

  const codeMatch = trimmed.match(/^([A-Z]{2,4}-[0-9]{3,4})\s+(.+)$/);
  if (!codeMatch) {
    return null;
  }

  const code = codeMatch[1];
  const rest = codeMatch[2].trim();

  const rowEvidence: Evidence = {
    page: pageNumber,
    sourceText: trimmed,
    method,
    confidence,
  };

  // Pattern A: Line Item with explicit Amount
  // e.g. "Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00"
  // Format: <description> <quantity> <unit> <unitPrice> <amount>
  const patternA = rest.match(
    /^(.*?)\s+(\d+(?:,\d+)*(?:\.\d+)?)\s+([A-Za-z]+)\s+(\$[0-9,]+(?:\.[0-9]{2})?)\s+(\$[0-9,]+(?:\.[0-9]{2})?)$/
  );

  if (patternA) {
    const description = patternA[1].trim();
    const quantity = patternA[2];
    const unit = patternA[3];
    const unitPrice = patternA[4];
    const amount = patternA[5];

    const evidenceMap: Partial<Record<NumericBusinessField, Evidence>> = {
      quantity: rowEvidence,
      unitPrice: rowEvidence,
      amount: rowEvidence,
    };

    return {
      page: pageNumber,
      code,
      description,
      quantity,
      unit,
      unitPrice,
      amount,
      evidence: evidenceMap as Record<string, Evidence>,
    };
  }

  // Pattern B: Line Item with Weight column and NO Amount column
  // e.g. "Coach screws, bulk carton 3 20kg $74.00 /carton"
  // Format: <description> <quantity> <weight> <unitPrice>
  const patternB = rest.match(
    /^(.*?)\s+(\d+(?:,\d+)*(?:\.\d+)?)\s+(\d+(?:\.\d+)?[a-zA-Z]+(?:\s+total)?)\s+(\$[0-9,]+(?:\.[0-9]{2})?(?:\s*\/\w+)?)$/
  );

  if (patternB) {
    const description = patternB[1].trim();
    const quantity = patternB[2];
    const weight = patternB[3];
    const unitPrice = patternB[4];

    const evidenceMap: Partial<Record<NumericBusinessField, Evidence>> = {
      quantity: rowEvidence,
      weight: rowEvidence,
      unitPrice: rowEvidence,
    };

    // STRICT: amount is undefined because it does not exist in the source document!
    return {
      page: pageNumber,
      code,
      description,
      quantity,
      weight,
      unitPrice,
      amount: undefined,
      evidence: evidenceMap as Record<string, Evidence>,
    };
  }

  return null;
}

/**
 * Parses all line items from an extracted page and verifies them against the Evidence Gate.
 */
export function parsePageLineItems(page: ExtractedPage): {
  items: LineItem[];
  refusals: Refusal[];
} {
  const items: LineItem[] = [];
  const refusals: Refusal[] = [];

  const lines = page.text.split("\n");

  for (const line of lines) {
    const classification = classifyRow(line);

    if (classification === "LINE_ITEM") {
      const candidateItem = tokenizeCandidateRow(
        line,
        page.page,
        page.method,
        page.confidence
      );

      if (candidateItem) {
        // Enforce Evidence Gate validation on every extracted numeric field
        const validationResult = validateLineItemEvidence(candidateItem, {
          pageSourceText: line,
          page: page.page,
        });

        items.push(validationResult.item);
        if (validationResult.refusals.length > 0) {
          refusals.push(...validationResult.refusals);
        }
      }
    }
  }

  return { items, refusals };
}
