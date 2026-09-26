import {
  type NumericBusinessField,
  NUMERIC_BUSINESS_FIELDS,
  type LineItem,
  LineItemSchema,
} from "./line-item";
import {
  type Evidence,
  EvidenceSchema,
} from "./evidence";
import {
  type Refusal,
  RefusalCode,
  createNotPresentInSourceRefusal,
  createRefusal,
} from "./refusal";

/**
 * Checks whether a candidate numeric string is authentically grounded
 * within a specific source text snippet or page excerpt.
 *
 * Conservative Rules:
 * 1. Empty candidate value or empty source text returns false.
 * 2. Token boundaries prevent matching digits inside unrelated codes (e.g. '4' inside 'FX-401').
 * 3. Spaces between currency symbols and digits are normalized ($ 74.00 == $74.00).
 * 4. Derived or calculated numbers that do not appear in the source text return false.
 */
export function isNumericValueGroundedInSource(
  candidateValue: string | undefined | null,
  sourceText: string | undefined | null
): boolean {
  if (!candidateValue || !sourceText) {
    return false;
  }

  const trimmedCandidate = candidateValue.trim();
  const trimmedSource = sourceText.trim();

  if (trimmedCandidate.length === 0 || trimmedSource.length === 0) {
    return false;
  }

  // 1. Whitespace normalization (collapse multi-spaces, newlines, tabs)
  const normSource = trimmedSource.replace(/\s+/g, " ");
  const normCandidate = trimmedCandidate.replace(/\s+/g, " ");

  // 2. Currency symbol spacing normalization (e.g. "$ 74.00" <=> "$74.00")
  const currencyCleanSource = normSource.replace(/([$€£¥])\s+/g, "$1");
  const currencyCleanCandidate = normCandidate.replace(/([$€£¥])\s+/g, "$1");

  // 3. Token-bounded regex check to prevent matching inside alphanumeric tokens or codes
  // e.g. Candidate "3" matches "3 carton", but "4" does NOT match inside "FX-401" or "$74.00"
  // and "401" does NOT match inside SKU "FX-401"
  const escapedCandidate = currencyCleanCandidate.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const tokenRegex = new RegExp(
    `(?<![0-9A-Za-z-,.%])${escapedCandidate}(?![0-9A-Za-z-,.%])`
  );

  if (tokenRegex.test(currencyCleanSource)) {
    return true;
  }

  // 4. If candidate includes currency symbol, also check if raw numeric core matches bounded in source
  const numericOnlyMatch = currencyCleanCandidate.match(
    /^[^\d]*([\d,]+(?:\.\d+)?)[^\d]*$/
  );
  if (numericOnlyMatch && numericOnlyMatch[1]) {
    const rawNumber = numericOnlyMatch[1];
    const escapedNumber = rawNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const numberRegex = new RegExp(
      `(?<![0-9A-Za-z-,.%])${escapedNumber}(?![0-9A-Za-z-,.%])`
    );
    if (numberRegex.test(currencyCleanSource)) {
      return true;
    }
  }

  return false;
}

export interface FieldValidationSuccess {
  valid: true;
  field: NumericBusinessField;
  value: string;
  evidence: Evidence;
}

export interface FieldValidationFailure {
  valid: false;
  field: NumericBusinessField;
  value?: string;
  refusal: Refusal;
}

export type FieldValidationResult =
  | FieldValidationSuccess
  | FieldValidationFailure;

/**
 * Validates a single candidate numeric business field against its evidence
 * and optional page source text.
 *
 * Invariant: Produces a Refusal domain object upon failure — NEVER throws an exception.
 */
export function validateNumericFieldEvidence(params: {
  field: NumericBusinessField;
  value?: string;
  evidence?: Evidence;
  pageSourceText?: string;
  page?: number;
}): FieldValidationResult {
  const { field, value, evidence, pageSourceText, page } = params;
  const effectivePage = page ?? evidence?.page ?? 1;

  // Case 1: Value is missing
  if (value === undefined || value.trim().length === 0) {
    return {
      valid: false,
      field,
      refusal: createNotPresentInSourceRefusal({
        field,
        page: effectivePage,
        customMessage: `The value for '${field}' is not present in the document on page ${effectivePage}. Values must not be inferred or calculated.`,
      }),
    };
  }

  // Case 2: Evidence object validation if provided
  if (evidence) {
    const parsedEvidence = EvidenceSchema.safeParse(evidence);
    if (!parsedEvidence.success) {
      return {
        valid: false,
        field,
        value,
        refusal: createRefusal({
          reasonCode: RefusalCode.NOT_PRESENT_IN_SOURCE,
          message: `The evidence for '${field}' on page ${effectivePage} is invalid or has empty source text.`,
          page: effectivePage,
          field,
        }),
      };
    }

    // Check against evidence sourceText
    if (isNumericValueGroundedInSource(value, evidence.sourceText)) {
      return {
        valid: true,
        field,
        value,
        evidence: parsedEvidence.data,
      };
    }
  }

  // Case 3: Check against surrounding pageSourceText if available
  if (pageSourceText && isNumericValueGroundedInSource(value, pageSourceText)) {
    const method = evidence?.method ?? "native";
    return {
      valid: true,
      field,
      value,
      evidence: {
        page: effectivePage,
        sourceText: pageSourceText.trim(),
        method,
        confidence: evidence?.confidence,
      },
    };
  }

  // If reached here, the candidate numeric value is ungrounded / missing / derived
  return {
    valid: false,
    field,
    value,
    refusal: createNotPresentInSourceRefusal({
      field,
      page: effectivePage,
      candidateValue: value,
      customMessage: `The numeric value '${value}' for '${field}' was not found in the source text on page ${effectivePage}. Calculating or deriving missing values is strictly prohibited.`,
    }),
  };
}

export interface LineItemValidationResult {
  valid: boolean;
  item: LineItem;
  refusals: Refusal[];
  validatedFields: FieldValidationSuccess[];
}

/**
 * Validates all numeric business fields in a LineItem.
 * Non-numeric fields (e.g. code "FX-401", description "10mm Coach screws")
 * are safely preserved and not rejected for having digits.
 *
 * Any numeric field failing the evidence gate is stripped from the returned item
 * and recorded as an explicit domain Refusal.
 */
export function validateLineItemEvidence(
  item: LineItem,
  context?: {
    pageSourceText?: string;
    page?: number;
  }
): LineItemValidationResult {
  const validatedItem: LineItem = { ...item };
  const refusals: Refusal[] = [];
  const validatedFields: FieldValidationSuccess[] = [];
  const validatedEvidenceRecord: Record<string, Evidence> = {
    ...(item.evidence || {}),
  };

  const itemPage = item.page ?? context?.page ?? 1;

  for (const field of NUMERIC_BUSINESS_FIELDS) {
    const candidateValue = item[field];
    if (candidateValue !== undefined) {
      const fieldEvidence = item.evidence?.[field];
      const validationResult = validateNumericFieldEvidence({
        field,
        value: candidateValue,
        evidence: fieldEvidence,
        pageSourceText: context?.pageSourceText,
        page: itemPage,
      });

      if (validationResult.valid) {
        validatedFields.push(validationResult);
        validatedEvidenceRecord[field] = validationResult.evidence;
      } else {
        // Strip the ungrounded / derived value from the item
        validatedItem[field] = undefined;
        refusals.push(validationResult.refusal);
      }
    }
  }

  validatedItem.evidence = validatedEvidenceRecord;

  return {
    valid: refusals.length === 0,
    item: LineItemSchema.parse(validatedItem),
    refusals,
    validatedFields,
  };
}

/**
 * Validates a batch of line items against the Evidence Invariant.
 */
export function validateEvidenceGate(params: {
  items: LineItem[];
  pageSourceText?: string;
  page?: number;
}): {
  validItems: LineItem[];
  refusals: Refusal[];
} {
  const validItems: LineItem[] = [];
  const refusals: Refusal[] = [];

  for (const item of params.items) {
    const result = validateLineItemEvidence(item, {
      pageSourceText: params.pageSourceText,
      page: params.page ?? item.page,
    });
    validItems.push(result.item);
    refusals.push(...result.refusals);
  }

  return {
    validItems,
    refusals,
  };
}
