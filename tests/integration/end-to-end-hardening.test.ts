import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/extract/route";
import { type ApiSuccessResponse } from "@/domain/api-contracts";
import { RefusalCode } from "@/domain/refusal";
import * as ocrExtractor from "@/extraction/ocr/ocr-extractor";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

function getFixtureBuffer(filename: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename));
}

function createRequestWithPdf(filename: string): NextRequest {
  const buffer = getFixtureBuffer(filename);
  const file = new File([new Uint8Array(buffer)], filename, {
    type: "application/pdf",
  });
  const formData = new FormData();
  formData.append("file", file);

  return new NextRequest("http://localhost:3000/api/extract", {
    method: "POST",
    body: formData,
  });
}

describe("End-to-End Hardening & Safety Audit (All 6 Assessment PDFs)", () => {
  // Test 1: Full E2E verification of all 6 assessment PDFs via POST /api/extract
  it("verifies all six assessment PDFs through the live HTTP Route Handler", async () => {
    // 1. IB-55871: Clean native extraction
    const req1 = createRequestWithPdf("IB-55871.pdf");
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as ApiSuccessResponse;
    expect(body1.data.items).toHaveLength(4);
    expect(body1.data.refusals).toHaveLength(0);
    expect(body1.data.status).toBe("success");

    // 2. IB-55902: Image-only PDF requiring local OCR fallback
    const req2 = createRequestWithPdf("IB-55902.pdf");
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as ApiSuccessResponse;
    expect(body2.data.items).toHaveLength(3);
    expect(body2.data.items[0].evidence?.amount?.method).toBe("ocr");
    expect(body2.data.items[0].evidence?.amount?.confidence).toBeGreaterThan(80);

    // 3. IB-56010: Weights table with NO Amount column (NO invented amounts)
    const req3 = createRequestWithPdf("IB-56010.pdf");
    const res3 = await POST(req3);
    expect(res3.status).toBe(200);
    const body3 = (await res3.json()) as ApiSuccessResponse;
    expect(body3.data.items).toHaveLength(4);
    for (const item of body3.data.items) {
      // STRICT INVARIANT: Amount is absent from source, so it MUST be undefined
      expect(item.amount).toBeUndefined();
    }
    // Verify exact raw weights preserved
    expect(body3.data.items[0].weight).toBe("20kg");
    expect(body3.data.items[1].weight).toBe("640g total");
    expect(body3.data.items[2].weight).toBe("1.4kg");
    expect(body3.data.items[3].weight).toBe("500g");

    // 4. IB-56088: 3 line items + 9 vs 11 carton count contradiction
    const req4 = createRequestWithPdf("IB-56088.pdf");
    const res4 = await POST(req4);
    expect(res4.status).toBe(200);
    const body4 = (await res4.json()) as ApiSuccessResponse;
    expect(body4.data.items).toHaveLength(3);
    expect(body4.data.refusals).toHaveLength(1);
    expect(body4.data.refusals[0].reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
    expect(body4.data.refusals[0].field).toBe("cartonCount");
    expect(body4.data.refusals[0].evidence).toHaveLength(2);
    expect(body4.data.refusals[0].evidence?.[0].sourceText).toContain("9 cartons dispatched");
    expect(body4.data.refusals[0].evidence?.[1].sourceText).toContain("11 cartons picked and loaded");

    // 5. IB-56150: 4 line items + total arithmetic conflict refusal
    const req5 = createRequestWithPdf("IB-56150.pdf");
    const res5 = await POST(req5);
    expect(res5.status).toBe(200);
    const body5 = (await res5.json()) as ApiSuccessResponse;
    expect(body5.data.items).toHaveLength(4);
    expect(body5.data.refusals).toHaveLength(1);
    expect(body5.data.refusals[0].reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
    expect(body5.data.refusals[0].field).toBe("total");
    expect(body5.data.refusals[0].message).toBe(
      "The printed total conflicts with the subtotal and GST shown in the document. No total was selected as verified."
    );
    expect(body5.data.refusals[0].message).not.toContain("1,460.50");
    expect(body5.data.refusals[0].message).not.toContain("41.30");
    expect(JSON.stringify(body5.data)).not.toContain("1,460.50");
    expect(JSON.stringify(body5.data)).not.toContain("41.30");

    // 6. IB-STMT47: 8 pages (3 items/page = 24 items), page 4 via OCR
    const req6 = createRequestWithPdf("IB-STMT47.pdf");
    const res6 = await POST(req6);
    expect(res6.status).toBe(200);
    const body6 = (await res6.json()) as ApiSuccessResponse;
    expect(body6.data.items).toHaveLength(24);
    expect(body6.data.pages).toHaveLength(8);
    // Page 4 items must be from OCR
    expect(body6.data.items[9].evidence?.amount?.method).toBe("ocr");
    // Pages 1-3, 5-8 must be native
    expect(body6.data.items[0].evidence?.amount?.method).toBe("native");
    expect(body6.data.items[12].evidence?.amount?.method).toBe("native");
  }, 35000);

  // Test 2: Rigorous Evidence Grounding Audit across ALL extracted numbers
  it("strictly validates that every single accepted numeric field traces back to source text", async () => {
    const allFiles = [
      "IB-55871.pdf",
      "IB-55902.pdf",
      "IB-56010.pdf",
      "IB-56088.pdf",
      "IB-56150.pdf",
      "IB-STMT47.pdf",
    ];

    let totalNumbersChecked = 0;

    for (const filename of allFiles) {
      const req = createRequestWithPdf(filename);
      const res = await POST(req);
      const body = (await res.json()) as ApiSuccessResponse;

      for (const item of body.data.items) {
        // Numeric business fields to audit: quantity, weight, unitPrice, amount
        const fieldsToCheck = ["quantity", "weight", "unitPrice", "amount"] as const;

        for (const field of fieldsToCheck) {
          const val = item[field];
          if (val !== undefined && val !== null) {
            totalNumbersChecked++;
            // 1. Evidence must exist
            const fieldEvidence = item.evidence?.[field];
            expect(
              fieldEvidence,
              `Missing evidence for field '${field}' on item ${item.code} in ${filename}`
            ).toBeDefined();

            // 2. Evidence must have positive page
            expect(fieldEvidence!.page).toBeGreaterThan(0);

            // 3. Evidence source text must be non-empty
            expect(fieldEvidence!.sourceText.trim().length).toBeGreaterThan(0);

            // 4. Evidence source text MUST contain the exact extracted value
            expect(
              fieldEvidence!.sourceText.includes(val) ||
                fieldEvidence!.sourceText.replace(/\s+/g, " ").includes(val.replace(/\s+/g, " ")),
              `Value '${val}' not found in evidence sourceText: "${fieldEvidence!.sourceText}"`
            ).toBe(true);
          }
        }
      }
    }

    // Ensure we audited a substantial body of numbers across all files
    expect(totalNumbersChecked).toBeGreaterThan(100);
  }, 35000);

  // Test 3: Simulated Partial Failure on IB-STMT47 (Page 4 OCR Failure Isolation)
  it("ensures page 4 OCR failure preserves pages 1-3 and 5-8 results (partial success)", async () => {
    const spy = vi
      .spyOn(ocrExtractor, "performOcrOnImageBuffer")
      .mockRejectedValueOnce(new Error("Worker OCR timeout simulating corrupted raster stream"));

    try {
      const req = createRequestWithPdf("IB-STMT47.pdf");
      const res = await POST(req);

      // Must remain HTTP 200, NEVER an HTTP 500 crash!
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiSuccessResponse;
      // 21 items from pages 1, 2, 3, 5, 6, 7, 8 MUST survive!
      expect(body.data.items).toHaveLength(21);
      expect(body.data.status).toBe("partial_success");

      // Refusal for page 4 failure must be documented
      expect(body.data.refusals.some((r) => r.page === 4)).toBe(true);
      const page4Refusal = body.data.refusals.find((r) => r.page === 4);
      expect(page4Refusal?.reasonCode).toBe(RefusalCode.PAGE_EXTRACTION_FAILED);
      expect(page4Refusal?.message).toContain("Page 4 could not be extracted");

      // Pages 1-3 items exist
      expect(body.data.items[0].code).toBe("CX-1000");
      // Pages 5-8 items exist
      expect(body.data.items.some((i) => i.code === "CX-1040")).toBe(true);
      expect(body.data.items.some((i) => i.code === "CX-1070")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  }, 20000);

  // Test 4: User-Facing Message Audit
  it("confirms no user-facing refusal or error contains generic 'Something went wrong'", async () => {
    const filesWithRefusals = ["IB-56088.pdf", "IB-56150.pdf"];

    for (const filename of filesWithRefusals) {
      const req = createRequestWithPdf(filename);
      const res = await POST(req);
      const body = (await res.json()) as ApiSuccessResponse;

      for (const refusal of body.data.refusals) {
        // Message must be non-generic, actionable, and informative
        expect(refusal.message.length).toBeGreaterThan(20);
        expect(refusal.message).not.toMatch(/something went wrong/i);
        expect(refusal.message).not.toMatch(/internal error/i);
        expect(refusal.message).not.toMatch(/undefined/i);
      }
    }
  }, 20000);
});
