import { describe, it, expect } from "vitest";
import {
  EvidenceSchema,
  createEvidence,
} from "@/domain/evidence";
import {
  LineItemSchema,
  createLineItem,
  NUMERIC_BUSINESS_FIELDS,
  isNumericBusinessField,
} from "@/domain/line-item";
import {
  ExtractionResultSchema,
  createExtractionResult,
} from "@/domain/extraction-result";
import { RefusalCode } from "@/domain/refusal";

describe("Domain Models & Schemas", () => {
  describe("Evidence Schema", () => {
    it("validates native evidence with valid page and source text", () => {
      const evidence = createEvidence({
        page: 1,
        sourceText: "Qty 40 @ $14.60",
        method: "native",
      });

      expect(evidence.page).toBe(1);
      expect(evidence.sourceText).toBe("Qty 40 @ $14.60");
      expect(evidence.method).toBe("native");
      expect(evidence.confidence).toBeUndefined();
    });

    it("validates OCR evidence with confidence score and bounding box", () => {
      const evidence = createEvidence({
        page: 2,
        sourceText: "Total $584.00",
        method: "ocr",
        confidence: 96.5,
        boundingBox: { x: 100, y: 200, width: 50, height: 20 },
      });

      expect(evidence.method).toBe("ocr");
      expect(evidence.confidence).toBe(96.5);
      expect(evidence.boundingBox?.width).toBe(50);
    });

    it("rejects non-positive page numbers", () => {
      expect(() =>
        EvidenceSchema.parse({
          page: 0,
          sourceText: "Some text",
          method: "native",
        })
      ).toThrow();

      expect(() =>
        EvidenceSchema.parse({
          page: -1,
          sourceText: "Some text",
          method: "native",
        })
      ).toThrow();
    });

    it("rejects empty source text", () => {
      expect(() =>
        EvidenceSchema.parse({
          page: 1,
          sourceText: "",
          method: "native",
        })
      ).toThrow();

      expect(() =>
        EvidenceSchema.parse({
          page: 1,
          sourceText: "   ",
          method: "native",
        })
      ).toThrow();
    });
  });

  describe("LineItem Schema", () => {
    it("supports preserving document numeric values as strings without premature float conversion", () => {
      const item = createLineItem({
        id: "item-1",
        page: 1,
        code: "FX-401",
        description: "Coach screws",
        quantity: "40",
        unitPrice: "$14.60",
        amount: "$584.00",
        unit: "carton",
      });

      expect(item.quantity).toBe("40");
      expect(item.unitPrice).toBe("$14.60");
      expect(item.amount).toBe("$584.00");
      expect(typeof item.unitPrice).toBe("string");
    });

    it("does not force every field to exist", () => {
      const minimalItem = createLineItem({
        description: "Standard service fee",
      });

      expect(minimalItem.description).toBe("Standard service fee");
      expect(minimalItem.quantity).toBeUndefined();
      expect(minimalItem.unitPrice).toBeUndefined();
      expect(minimalItem.amount).toBeUndefined();
    });

    it("correctly identifies designated numeric business fields", () => {
      expect(NUMERIC_BUSINESS_FIELDS).toEqual([
        "quantity",
        "weight",
        "unitPrice",
        "amount",
      ]);

      expect(isNumericBusinessField("quantity")).toBe(true);
      expect(isNumericBusinessField("weight")).toBe(true);
      expect(isNumericBusinessField("unitPrice")).toBe(true);
      expect(isNumericBusinessField("amount")).toBe(true);

      // Non-numeric fields that may contain digits
      expect(isNumericBusinessField("code")).toBe(false);
      expect(isNumericBusinessField("description")).toBe(false);
      expect(isNumericBusinessField("unit")).toBe(false);
    });
  });

  describe("ExtractionResult & Page Failure Isolation", () => {
    it("preserves successful pages when another page fails (partial_success)", () => {
      const result = createExtractionResult({
        status: "partial_success",
        items: [
          {
            page: 1,
            description: "Coach screws",
            quantity: "3",
            unitPrice: "$74.00",
          },
        ],
        refusals: [
          {
            reasonCode: RefusalCode.PAGE_EXTRACTION_FAILED,
            page: 2,
            message: "Page 2 could not be extracted: rendering timeout",
          },
        ],
        pages: [
          {
            page: 1,
            status: "success",
            items: [
              {
                page: 1,
                description: "Coach screws",
                quantity: "3",
                unitPrice: "$74.00",
              },
            ],
            refusals: [],
            methodUsed: "native",
          },
          {
            page: 2,
            status: "failed",
            items: [],
            refusals: [
              {
                reasonCode: RefusalCode.PAGE_EXTRACTION_FAILED,
                page: 2,
                message: "Page 2 could not be extracted: rendering timeout",
              },
            ],
            methodUsed: "none",
            error: "rendering timeout",
          },
        ],
        summary: {
          totalPages: 2,
          extractedPages: 1,
          failedPages: 1,
          totalItems: 1,
          totalRefusals: 1,
        },
      });

      expect(result.status).toBe("partial_success");
      expect(result.items).toHaveLength(1);
      expect(result.pages?.[0].status).toBe("success");
      expect(result.pages?.[1].status).toBe("failed");
      // Page 1 items are NOT lost
      expect(result.items[0].description).toBe("Coach screws");
      // Page 2 failure is isolated in refusals
      expect(result.refusals[0].reasonCode).toBe("PAGE_EXTRACTION_FAILED");
    });
  });
});
