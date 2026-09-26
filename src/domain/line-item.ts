import { z } from "zod";
import { EvidenceSchema, type Evidence } from "./evidence";

/**
 * Specifically defined numeric business fields subject to the Evidence Invariant.
 *
 * NOTE: Non-numeric fields such as `code` ("FX-401") and `description` ("Coach screws 10mm")
 * frequently contain numbers/digits. The validator MUST target only these designated numeric
 * business fields rather than naively checking every digit in a document.
 */
export const NUMERIC_BUSINESS_FIELDS = [
  "quantity",
  "weight",
  "unitPrice",
  "amount",
] as const;

export type NumericBusinessField = (typeof NUMERIC_BUSINESS_FIELDS)[number];

export function isNumericBusinessField(field: string): field is NumericBusinessField {
  return (NUMERIC_BUSINESS_FIELDS as readonly string[]).includes(field);
}

/**
 * LineItem schema representing an extracted quote or invoice line item.
 *
 * Invariant: Document numeric values (quantity, weight, unitPrice, amount) are preserved
 * as raw strings (e.g. "$14.60", "40", "$584.00") rather than prematurely converted to
 * floating-point numbers.
 *
 * Each numeric field may be accompanied by its verifiable evidence.
 */
export const LineItemSchema = z.object({
  id: z.string().optional(),
  page: z.number().int().positive().optional(),
  itemNumber: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.string().optional(),
  weight: z.string().optional(),
  unitPrice: z.string().optional(),
  amount: z.string().optional(),
  evidence: z.record(z.string(), EvidenceSchema).optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * Helper to construct and validate a LineItem.
 */
export function createLineItem(data: {
  id?: string;
  page?: number;
  itemNumber?: string;
  code?: string;
  description?: string;
  unit?: string;
  quantity?: string;
  weight?: string;
  unitPrice?: string;
  amount?: string;
  evidence?: Partial<Record<NumericBusinessField, Evidence>> & Record<string, Evidence>;
}): LineItem {
  return LineItemSchema.parse(data);
}
