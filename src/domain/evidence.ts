import { z } from "zod";

/**
 * Extraction method indicates whether text was extracted natively from the
 * embedded PDF text layer or synthesized via OCR fallback.
 */
export const ExtractionMethodSchema = z.enum(["native", "ocr"]);
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

/**
 * Geometric bounding box for OCR or spatial coordinates on a page.
 */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/**
 * Evidence ties an extracted value to an immutable, verbatim excerpt from a specific document page.
 *
 * Invariant: Every numeric document value MUST have verifiable evidence.
 */
export const EvidenceSchema = z.object({
  page: z.number().int().positive({
    message: "Page must be a positive integer (>= 1)",
  }),
  sourceText: z.string().trim().min(1, {
    message: "Source text must be a non-empty verbatim string from the page",
  }),
  method: ExtractionMethodSchema,
  confidence: z
    .number()
    .min(0, { message: "Confidence score cannot be negative" })
    .max(100, { message: "Confidence score cannot exceed 100" })
    .optional(),
  boundingBox: BoundingBoxSchema.optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * Helper to construct an Evidence object with schema validation.
 */
export function createEvidence(data: {
  page: number;
  sourceText: string;
  method: ExtractionMethod;
  confidence?: number;
  boundingBox?: BoundingBox;
}): Evidence {
  return EvidenceSchema.parse(data);
}
