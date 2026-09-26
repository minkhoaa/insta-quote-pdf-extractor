import { describe, it, expect } from "vitest";
import {
  RefusalCode,
  RefusalSchema,
  createRefusal,
  createNotPresentInSourceRefusal,
  createContradictoryValuesRefusal,
  createAmbiguousValueRefusal,
  createOcrLowConfidenceRefusal,
  createPageExtractionFailedRefusal,
  createUnsupportedStructureRefusal,
} from "@/domain/refusal";
import { type Evidence } from "@/domain/evidence";

describe("Refusal Domain Model", () => {
  // Test 6 from prompt: Contradiction refusal can carry multiple pieces of evidence
  it("allows a CONTRADICTORY_VALUES refusal to carry multiple pieces of evidence", () => {
    const evidence1: Evidence = {
      page: 1,
      sourceText: "Qty: 10 units in Box A",
      method: "native",
    };

    const evidence2: Evidence = {
      page: 1,
      sourceText: "Qty: 15 units shipped",
      method: "ocr",
      confidence: 94.5,
    };

    const refusal = createContradictoryValuesRefusal({
      field: "quantity",
      page: 1,
      evidence: [evidence1, evidence2],
    });

    expect(refusal.reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
    expect(refusal.field).toBe("quantity");
    expect(refusal.page).toBe(1);
    expect(refusal.evidence).toBeDefined();
    expect(refusal.evidence).toHaveLength(2);
    expect(refusal.evidence?.[0].sourceText).toBe("Qty: 10 units in Box A");
    expect(refusal.evidence?.[1].sourceText).toBe("Qty: 15 units shipped");
    expect(refusal.evidence?.[1].confidence).toBe(94.5);

    // Validate that it adheres to RefusalSchema
    const parseResult = RefusalSchema.safeParse(refusal);
    expect(parseResult.success).toBe(true);
  });

  // Verify all 6 required machine-readable refusal codes exist
  it("supports all required stable machine-readable refusal codes", () => {
    const expectedCodes = [
      "NOT_PRESENT_IN_SOURCE",
      "AMBIGUOUS_VALUE",
      "CONTRADICTORY_VALUES",
      "OCR_LOW_CONFIDENCE",
      "PAGE_EXTRACTION_FAILED",
      "UNSUPPORTED_DOCUMENT_STRUCTURE",
    ];

    for (const code of expectedCodes) {
      expect(Object.values(RefusalCode)).toContain(code);
    }
  });

  // Plain-language user-friendly messages
  it("produces non-technical plain-language messages for each refusal type", () => {
    const notPresent = createNotPresentInSourceRefusal({
      field: "unitPrice",
      page: 2,
      candidateValue: "$100.00",
    });
    expect(notPresent.message).toMatch(
      /The numeric value '\$100\.00' for 'unitPrice' was not found in the source text on page 2/
    );

    const ambiguous = createAmbiguousValueRefusal({
      field: "quantity",
      page: 1,
    });
    expect(ambiguous.message).toMatch(/is ambiguous and could not be determined with certainty/);

    const lowConfidence = createOcrLowConfidenceRefusal({
      page: 3,
      confidence: 48.2,
      threshold: 75.0,
    });
    expect(lowConfidence.message).toMatch(
      /page 3 was recognized with low OCR confidence \(48\.2%\), which is below the safe threshold of 75\.0%/
    );

    const pageFailed = createPageExtractionFailedRefusal({
      page: 4,
      reason: "corrupted stream rendering",
    });
    expect(pageFailed.message).toMatch(
      /Page 4 could not be extracted: corrupted stream rendering\. Successfully extracted pages have been preserved/
    );

    const unsupported = createUnsupportedStructureRefusal({
      page: 1,
      reason: "handwritten unstructured notes",
    });
    expect(unsupported.message).toMatch(
      /document structure on page 1 is not supported for safe line-item extraction: handwritten unstructured notes/
    );
  });

  // Refusal is domain data, not an exception
  it("treats refusals as normal domain data rather than thrown exceptions", () => {
    // Calling createRefusal returns a plain JavaScript object
    const refusal = createRefusal({
      reasonCode: RefusalCode.NOT_PRESENT_IN_SOURCE,
      message: "Value missing from document",
      field: "amount",
      page: 1,
    });

    expect(refusal).toBeTypeOf("object");
    expect(refusal instanceof Error).toBe(false);
    expect(refusal.reasonCode).toBe("NOT_PRESENT_IN_SOURCE");
  });
});
