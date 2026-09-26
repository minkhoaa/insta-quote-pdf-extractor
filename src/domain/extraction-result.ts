import { z } from "zod";
import { LineItemSchema, type LineItem } from "./line-item";
import { RefusalSchema, type Refusal } from "./refusal";
import { ExtractionMethodSchema } from "./evidence";

export const ExtractionStatusSchema = z.enum([
  "success",
  "partial_success",
  "refused",
]);
export type ExtractionStatus = z.infer<typeof ExtractionStatusSchema>;

export const PageStatusSchema = z.enum([
  "success",
  "partial_success",
  "failed",
  "refused",
]);
export type PageStatus = z.infer<typeof PageStatusSchema>;

/**
 * Result of extracting a single page.
 * Failure on one page is isolated here and does not compromise other pages.
 */
export const PageExtractionResultSchema = z.object({
  page: z.number().int().positive(),
  status: PageStatusSchema,
  items: z.array(LineItemSchema),
  refusals: z.array(RefusalSchema),
  methodUsed: z.union([ExtractionMethodSchema, z.literal("none")]).optional(),
  rawText: z.string().optional(),
  error: z.string().optional(),
});
export type PageExtractionResult = z.infer<typeof PageExtractionResultSchema>;

export const ExtractionSummarySchema = z.object({
  totalPages: z.number().int().nonnegative(),
  extractedPages: z.number().int().nonnegative(),
  failedPages: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  totalRefusals: z.number().int().nonnegative(),
});
export type ExtractionSummary = z.infer<typeof ExtractionSummarySchema>;

/**
 * Overall document extraction result.
 */
export const ExtractionResultSchema = z.object({
  status: ExtractionStatusSchema,
  items: z.array(LineItemSchema),
  refusals: z.array(RefusalSchema),
  pages: z.array(PageExtractionResultSchema).optional(),
  summary: ExtractionSummarySchema.optional(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Helper to construct a typed ExtractionResult.
 */
export function createExtractionResult(data: {
  status: ExtractionStatus;
  items: LineItem[];
  refusals: Refusal[];
  pages?: PageExtractionResult[];
  summary?: ExtractionSummary;
}): ExtractionResult {
  return ExtractionResultSchema.parse(data);
}
