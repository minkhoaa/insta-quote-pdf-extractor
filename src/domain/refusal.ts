import { z } from "zod";
import { EvidenceSchema, type Evidence } from "./evidence";

/**
 * Stable machine-readable refusal codes.
 *
 * Invariant: Refusal is domain data representing safe rejection,
 * NEVER thrown as an unexpected runtime crash or HTTP 500.
 */
export const RefusalCode = {
  NOT_PRESENT_IN_SOURCE: "NOT_PRESENT_IN_SOURCE",
  AMBIGUOUS_VALUE: "AMBIGUOUS_VALUE",
  CONTRADICTORY_VALUES: "CONTRADICTORY_VALUES",
  OCR_LOW_CONFIDENCE: "OCR_LOW_CONFIDENCE",
  PAGE_EXTRACTION_FAILED: "PAGE_EXTRACTION_FAILED",
  UNSUPPORTED_DOCUMENT_STRUCTURE: "UNSUPPORTED_DOCUMENT_STRUCTURE",
} as const;

export const RefusalCodeSchema = z.enum([
  "NOT_PRESENT_IN_SOURCE",
  "AMBIGUOUS_VALUE",
  "CONTRADICTORY_VALUES",
  "OCR_LOW_CONFIDENCE",
  "PAGE_EXTRACTION_FAILED",
  "UNSUPPORTED_DOCUMENT_STRUCTURE",
]);

export type RefusalCode = z.infer<typeof RefusalCodeSchema>;

/**
 * Refusal domain model.
 * Carries non-technical plain-language explanation, optional page/field context,
 * and optional evidence (such as multiple conflicting excerpts in contradiction cases).
 */
export const RefusalSchema = z.object({
  reasonCode: RefusalCodeSchema,
  message: z.string().trim().min(1, { message: "Refusal message must not be empty" }),
  page: z.number().int().positive().optional(),
  field: z.string().optional(),
  evidence: z.array(EvidenceSchema).optional(),
});

export type Refusal = z.infer<typeof RefusalSchema>;

/**
 * Helper to construct a typed Refusal domain object.
 */
export function createRefusal(data: {
  reasonCode: RefusalCode;
  message: string;
  page?: number;
  field?: string;
  evidence?: Evidence[];
}): Refusal {
  return RefusalSchema.parse(data);
}

/**
 * Specific refusal factory: Value not present in source text.
 */
export function createNotPresentInSourceRefusal(params: {
  field: string;
  page?: number;
  candidateValue?: string;
  customMessage?: string;
}): Refusal {
  const pageSnippet = params.page ? ` on page ${params.page}` : "";
  const valueSnippet = params.candidateValue
    ? ` '${params.candidateValue}'`
    : "";
  const defaultMessage = `The numeric value${valueSnippet} for '${params.field}' was not found in the source text${pageSnippet}. Calculating or deriving missing values is strictly prohibited.`;

  return RefusalSchema.parse({
    reasonCode: RefusalCode.NOT_PRESENT_IN_SOURCE,
    message: params.customMessage || defaultMessage,
    page: params.page,
    field: params.field,
  });
}

/**
 * Specific refusal factory: Contradictory values detected across one or more pages.
 */
export function createContradictoryValuesRefusal(params: {
  field: string;
  page?: number;
  evidence: Evidence[];
  customMessage?: string;
}): Refusal {
  const pageSnippet = params.page ? ` on page ${params.page}` : "";
  const defaultMessage = `Conflicting values were detected for '${params.field}'${pageSnippet}. The document contains contradictory information that cannot be resolved safely.`;

  return RefusalSchema.parse({
    reasonCode: RefusalCode.CONTRADICTORY_VALUES,
    message: params.customMessage || defaultMessage,
    page: params.page,
    field: params.field,
    evidence: params.evidence,
  });
}

/**
 * Specific refusal factory: Value is ambiguous.
 */
export function createAmbiguousValueRefusal(params: {
  field: string;
  page?: number;
  evidence?: Evidence[];
  customMessage?: string;
}): Refusal {
  const pageSnippet = params.page ? ` on page ${params.page}` : "";
  const defaultMessage = `The value for '${params.field}'${pageSnippet} is ambiguous and could not be determined with certainty.`;

  return RefusalSchema.parse({
    reasonCode: RefusalCode.AMBIGUOUS_VALUE,
    message: params.customMessage || defaultMessage,
    page: params.page,
    field: params.field,
    evidence: params.evidence,
  });
}

/**
 * Specific refusal factory: OCR confidence is too low to guarantee safety.
 */
export function createOcrLowConfidenceRefusal(params: {
  page: number;
  confidence: number;
  threshold: number;
  field?: string;
  evidence?: Evidence[];
  customMessage?: string;
}): Refusal {
  const defaultMessage = `The text on page ${params.page} was recognized with low OCR confidence (${params.confidence.toFixed(1)}%), which is below the safe threshold of ${params.threshold.toFixed(1)}%.`;

  return RefusalSchema.parse({
    reasonCode: RefusalCode.OCR_LOW_CONFIDENCE,
    message: params.customMessage || defaultMessage,
    page: params.page,
    field: params.field,
    evidence: params.evidence,
  });
}

/**
 * Specific refusal factory: Extraction failed on a specific page.
 */
export function createPageExtractionFailedRefusal(params: {
  page: number;
  reason: string;
  customMessage?: string;
}): Refusal {
  const defaultMessage = `Page ${params.page} could not be extracted: ${params.reason}. Successfully extracted pages have been preserved.`;

  return RefusalSchema.parse({
    reasonCode: RefusalCode.PAGE_EXTRACTION_FAILED,
    message: params.customMessage || defaultMessage,
    page: params.page,
  });
}

/**
 * Specific refusal factory: Document structure unsupported for tabular line-item parsing.
 */
export function createUnsupportedStructureRefusal(params: {
  page?: number;
  reason?: string;
  customMessage?: string;
}): Refusal {
  const pageSnippet = params.page ? ` on page ${params.page}` : "";
  const reasonSnippet = params.reason ? `: ${params.reason}` : "";
  const defaultMessage = `The document structure${pageSnippet} is not supported for safe line-item extraction${reasonSnippet}.`;

  return RefusalSchema.parse({
    reasonCode: RefusalCode.UNSUPPORTED_DOCUMENT_STRUCTURE,
    message: params.customMessage || defaultMessage,
    page: params.page,
  });
}
