import { describe, it, expect } from "vitest";
import {
  isNumericValueGroundedInSource,
  validateNumericFieldEvidence,
  validateLineItemEvidence,
  validateEvidenceGate,
} from "@/domain/validation";
import { RefusalCode } from "@/domain/refusal";
import { type LineItem } from "@/domain/line-item";
import { type Evidence } from "@/domain/evidence";

describe("Evidence Gate & Validation Rules", () => {
  // Test 1: Valid sourced quantity
  it("passes validation for a valid sourced quantity", () => {
    const sourceText = "FX-401 Coach screws 3 carton $74.00 /carton";
    const result = validateNumericFieldEvidence({
      field: "quantity",
      value: "3",
      pageSourceText: sourceText,
      page: 1,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.field).toBe("quantity");
      expect(result.value).toBe("3");
      expect(result.evidence.page).toBe(1);
      expect(result.evidence.sourceText).toContain("3");
    }
  });

  // Test 2: Valid sourced amount
  it("passes validation for a valid sourced amount", () => {
    const sourceText = "Coach screws 40 pcs @ $14.60 = $584.00 total";
    const result = validateNumericFieldEvidence({
      field: "amount",
      value: "$584.00",
      pageSourceText: sourceText,
      page: 1,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.field).toBe("amount");
      expect(result.value).toBe("$584.00");
      expect(result.evidence.sourceText).toContain("$584.00");
    }
  });

  // Test 3: Derived amount rejected (CRITICAL VERIFICATION RULE)
  it("strictly rejects derived amount ($222.00 from 3 * 74) when not present in source", () => {
    const sourceText = "Qty 3 Unit Price $74.00";
    const derivedCandidateAmount = "$222.00";

    // 1. Direct grounding check must return false
    expect(isNumericValueGroundedInSource(derivedCandidateAmount, sourceText)).toBe(false);

    // 2. Candidate field validation must fail without throwing an exception
    const fieldResult = validateNumericFieldEvidence({
      field: "amount",
      value: derivedCandidateAmount,
      pageSourceText: sourceText,
      page: 1,
    });

    expect(fieldResult.valid).toBe(false);
    if (!fieldResult.valid) {
      // Must be a standard domain Refusal object, NOT an exception
      expect(fieldResult.refusal).toBeDefined();
      expect(fieldResult.refusal.reasonCode).toBe(RefusalCode.NOT_PRESENT_IN_SOURCE);
      expect(fieldResult.refusal.field).toBe("amount");
      expect(fieldResult.refusal.page).toBe(1);
      expect(fieldResult.refusal.message).toContain("$222.00");
      expect(fieldResult.refusal.message).toContain("strictly prohibited");
    }

    // 3. LineItem validation must strip the derived amount while keeping valid fields
    const candidateItem: LineItem = {
      description: "Coach screws",
      quantity: "3",
      unitPrice: "$74.00",
      amount: derivedCandidateAmount, // Artificially calculated 3 * 74
    };

    const lineItemResult = validateLineItemEvidence(candidateItem, {
      pageSourceText: sourceText,
      page: 1,
    });

    expect(lineItemResult.valid).toBe(false);
    expect(lineItemResult.refusals).toHaveLength(1);
    expect(lineItemResult.refusals[0].field).toBe("amount");
    expect(lineItemResult.refusals[0].reasonCode).toBe(RefusalCode.NOT_PRESENT_IN_SOURCE);

    // The derived amount MUST be stripped from the verified line item
    expect(lineItemResult.item.amount).toBeUndefined();
    // Valid sourced values MUST be preserved
    expect(lineItemResult.item.quantity).toBe("3");
    expect(lineItemResult.item.unitPrice).toBe("$74.00");
    expect(lineItemResult.item.description).toBe("Coach screws");
  });

  // Test 4: Empty evidence rejected
  it("rejects empty evidence and whitespace-only source text", () => {
    // Empty source string
    expect(isNumericValueGroundedInSource("10", "")).toBe(false);
    expect(isNumericValueGroundedInSource("10", "   ")).toBe(false);
    expect(isNumericValueGroundedInSource("", "Qty: 10")).toBe(false);

    const emptyEvidence: Evidence = {
      page: 1,
      sourceText: "   ",
      method: "native",
    };

    const result = validateNumericFieldEvidence({
      field: "quantity",
      value: "10",
      evidence: emptyEvidence,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.refusal.reasonCode).toBe(RefusalCode.NOT_PRESENT_IN_SOURCE);
      expect(result.refusal.message).toContain("invalid or has empty source text");
    }
  });

  // Test 5: Unsupported / missing numeric value represented as refusal rather than invented
  it("represents missing numeric value as explicit refusal rather than inventing or defaulting", () => {
    const sourceText = "Item: Hex Bolt 10mm; Unit Price: $5.00";
    
    // Quantity was not stated in the source document
    const result = validateNumericFieldEvidence({
      field: "quantity",
      value: undefined,
      pageSourceText: sourceText,
      page: 2,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.refusal.reasonCode).toBe(RefusalCode.NOT_PRESENT_IN_SOURCE);
      expect(result.refusal.field).toBe("quantity");
      expect(result.refusal.page).toBe(2);
      expect(result.refusal.message).toContain("not present in the document");
    }
  });

  // Test 6: Non-numeric fields containing digits are preserved safely
  it("does not reject non-numeric fields (e.g. code 'FX-401' or description '10mm bolts') for containing digits", () => {
    const sourceText = "FX-401 Coach screws 10mm 3 carton $74.00 /carton";
    const item: LineItem = {
      code: "FX-401",
      description: "Coach screws 10mm",
      unit: "carton",
      quantity: "3",
      unitPrice: "$74.00",
    };

    const result = validateLineItemEvidence(item, {
      pageSourceText: sourceText,
      page: 1,
    });

    expect(result.valid).toBe(true);
    expect(result.refusals).toHaveLength(0);
    // Non-numeric fields preserved exactly
    expect(result.item.code).toBe("FX-401");
    expect(result.item.description).toBe("Coach screws 10mm");
    expect(result.item.unit).toBe("carton");
    // Numeric fields verified
    expect(result.item.quantity).toBe("3");
    expect(result.item.unitPrice).toBe("$74.00");
  });

  // Test 7: Batch validation via validateEvidenceGate
  it("batch validates multiple items and isolates invalid fields into refusals", () => {
    const pageText = "Line 1: Widget A Qty 5 Price $10.00 | Line 2: Widget B Price $20.00";
    const items: LineItem[] = [
      { description: "Widget A", quantity: "5", unitPrice: "$10.00" },
      // Widget B has derived amount $40.00 not in pageText
      { description: "Widget B", unitPrice: "$20.00", amount: "$40.00" },
    ];

    const gateResult = validateEvidenceGate({
      items,
      pageSourceText: pageText,
      page: 1,
    });

    expect(gateResult.validItems).toHaveLength(2);
    expect(gateResult.validItems[0].quantity).toBe("5");
    expect(gateResult.validItems[0].unitPrice).toBe("$10.00");

    // Second item should have its ungrounded amount stripped
    expect(gateResult.validItems[1].unitPrice).toBe("$20.00");
    expect(gateResult.validItems[1].amount).toBeUndefined();

    // Refusal recorded for amount
    expect(gateResult.refusals).toHaveLength(1);
    expect(gateResult.refusals[0].field).toBe("amount");
    expect(gateResult.refusals[0].reasonCode).toBe(RefusalCode.NOT_PRESENT_IN_SOURCE);
  });
});
