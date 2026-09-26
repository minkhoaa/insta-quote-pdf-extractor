import {
  type Refusal,
  createContradictoryValuesRefusal,
} from "@/domain/refusal";
import { type Evidence } from "@/domain/evidence";
import { type ExtractedPage } from "../pipeline";

/**
 * Detects discrepancies between dispatched and picked/loaded carton counts.
 * Example (IB-56088):
 * - "Summary: 9 cartons dispatched from Ironbark warehouse this run."
 * - "Warehouse notes: 11 cartons picked and loaded onto the truck."
 */
export function detectCartonContradiction(
  lines: string[],
  pageNumber: number,
  method: "native" | "ocr",
  confidence?: number
): Refusal | null {
  let dispatchedLine: string | null = null;
  let dispatchedCount: number | null = null;

  let loadedLine: string | null = null;
  let loadedCount: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for dispatched count
    const dispatchMatch = trimmed.match(
      /(\d+)\s+cartons?\s+dispatched/i
    );
    if (dispatchMatch) {
      dispatchedLine = trimmed;
      dispatchedCount = parseInt(dispatchMatch[1], 10);
    }

    // Check for picked / loaded count
    const loadedMatch = trimmed.match(
      /(\d+)\s+cartons?\s+(?:picked\s+and\s+loaded|loaded)/i
    );
    if (loadedMatch) {
      loadedLine = trimmed;
      loadedCount = parseInt(loadedMatch[1], 10);
    }
  }

  if (
    dispatchedCount !== null &&
    loadedCount !== null &&
    dispatchedCount !== loadedCount &&
    dispatchedLine &&
    loadedLine
  ) {
    const evidence1: Evidence = {
      page: pageNumber,
      sourceText: dispatchedLine,
      method,
      confidence,
    };
    const evidence2: Evidence = {
      page: pageNumber,
      sourceText: loadedLine,
      method,
      confidence,
    };

    return createContradictoryValuesRefusal({
      field: "cartonCount",
      page: pageNumber,
      evidence: [evidence1, evidence2],
      customMessage: `Conflicting carton counts detected on page ${pageNumber}: warehouse dispatch summary states '${dispatchedCount} cartons dispatched', but warehouse notes state '${loadedCount} cartons picked and loaded'. Neither figure can be safely accepted as the verified count.`,
    });
  }

  return null;
}

/**
 * Detects discrepancies between printed Subtotal + GST and printed Total.
 * Example (IB-56150):
 * - Subtotal: $1,270.00
 * - GST (15%): $190.50
 * - Total (incl GST): $1,501.80  (Expected: $1,460.50)
 *
 * Invariant: Never silently repair or overwrite document numbers.
 */
export function detectTotalArithmeticContradiction(
  lines: string[],
  pageNumber: number,
  method: "native" | "ocr",
  confidence?: number
): Refusal | null {
  let subtotalLine: string | null = null;
  let subtotalVal: number | null = null;

  let gstLine: string | null = null;
  let gstVal: number | null = null;

  let totalLine: string | null = null;
  let totalVal: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const subMatch = trimmed.match(/Subtotal:?\s*\$?([0-9,]+(?:\.\d{2})?)/i);
    if (subMatch) {
      subtotalLine = trimmed;
      subtotalVal = parseFloat(subMatch[1].replace(/,/g, ""));
    }

    const gstMatch = trimmed.match(/GST\s*\([^)]*\):?\s*\$?([0-9,]+(?:\.\d{2})?)/i);
    if (gstMatch) {
      gstLine = trimmed;
      gstVal = parseFloat(gstMatch[1].replace(/,/g, ""));
    }

    const totMatch = trimmed.match(/Total\s*\([^)]*\):?\s*\$?([0-9,]+(?:\.\d{2})?)/i);
    if (totMatch) {
      totalLine = trimmed;
      totalVal = parseFloat(totMatch[1].replace(/,/g, ""));
    }
  }

  if (
    subtotalVal !== null &&
    gstVal !== null &&
    totalVal !== null &&
    subtotalLine &&
    gstLine &&
    totalLine
  ) {
    const expectedSum = Math.round((subtotalVal + gstVal) * 100) / 100;
    const diff = Math.abs(expectedSum - totalVal);

    if (diff > 0.05) {
      const evidence: Evidence[] = [
        { page: pageNumber, sourceText: subtotalLine, method, confidence },
        { page: pageNumber, sourceText: gstLine, method, confidence },
        { page: pageNumber, sourceText: totalLine, method, confidence },
      ];

      return createContradictoryValuesRefusal({
        field: "total",
        page: pageNumber,
        evidence,
        customMessage: `The printed invoice total ($${totalVal.toFixed(
          2
        )}) contradicts the arithmetic sum of printed Subtotal ($${subtotalVal.toFixed(
          2
        )}) and GST ($${gstVal.toFixed(
          2
        )}), which equals $${expectedSum.toFixed(
          2
        )}. Silent arithmetic repair is prohibited; the figures are flagged as contradictory.`,
      });
    }
  }

  return null;
}

/**
 * Runs all contradiction checks across an extracted page.
 */
export function detectPageContradictions(page: ExtractedPage): Refusal[] {
  const refusals: Refusal[] = [];
  const lines = page.text.split("\n");

  const cartonContradiction = detectCartonContradiction(
    lines,
    page.page,
    page.method,
    page.confidence
  );
  if (cartonContradiction) {
    refusals.push(cartonContradiction);
  }

  const totalContradiction = detectTotalArithmeticContradiction(
    lines,
    page.page,
    page.method,
    page.confidence
  );
  if (totalContradiction) {
    refusals.push(totalContradiction);
  }

  return refusals;
}
