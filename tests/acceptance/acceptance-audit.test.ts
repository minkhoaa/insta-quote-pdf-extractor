import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/extract/route";
import {
  type ApiSuccessResponse,
  type ApiErrorResponse,
  ApiErrorCode,
  MAX_FILE_SIZE_BYTES,
} from "@/domain/api-contracts";
import { RefusalCode } from "@/domain/refusal";
import {
  isNumericBusinessField,
  NUMERIC_BUSINESS_FIELDS,
  type LineItem,
} from "@/domain/line-item";
import {
  isNumericValueGroundedInSource,
  validateLineItemEvidence,
} from "@/domain/validation";
import {
  classifyRow,
  tokenizeCandidateRow,
  parsePageLineItems,
} from "@/extraction/parser/table-parser";
import { extractDocumentPages, type ExtractedPage } from "@/extraction/pipeline";
import { parseExtractedDocument } from "@/extraction/parser";
import * as ocrExtractor from "@/extraction/ocr/ocr-extractor";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

function getFixtureBuffer(filename: string): Buffer {
  const filePath = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function createRequestWithBuffer(
  buffer: Buffer | Uint8Array,
  filename: string,
  mimeType = "application/pdf"
): NextRequest {
  const file = new File([new Uint8Array(buffer)], filename, { type: mimeType });
  const formData = new FormData();
  formData.append("file", file);

  return new NextRequest("http://localhost:3000/api/extract", {
    method: "POST",
    body: formData,
  });
}

describe("Comprehensive Acceptance Audit Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // STEP 6: TEST ALL SIX PROVIDED PDFs
  // =========================================================================
  describe("Step 6: Diagnostic Matrix & Acceptance for All 6 Fixtures", () => {
    // CASE A: IB-55871
    it("Case A: IB-55871 (Clean native baseline, 4 items, no refusals, no total row items)", async () => {
      const buffer = getFixtureBuffer("IB-55871.pdf");
      const req = createRequestWithBuffer(buffer, "IB-55871.pdf");
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      const { data } = json;
      expect(data.status).toBe("success");
      expect(data.refusals).toHaveLength(0);
      expect(data.items).toHaveLength(4); // Strictly 4 items, NOT 7!

      // Item 1: FX-201
      const item1 = data.items.find((i) => i.code === "FX-201");
      expect(item1).toBeDefined();
      expect(item1?.quantity).toBe("24");
      expect(item1?.unit).toBe("box");
      expect(item1?.unitPrice).toBe("$52.00");
      expect(item1?.amount).toBe("$1,248.00");
      expect(item1?.page).toBe(1);
      expect(item1?.evidence?.amount?.method).toBe("native");

      // Item 2: FX-118
      const item2 = data.items.find((i) => i.code === "FX-118");
      expect(item2).toBeDefined();
      expect(item2?.quantity).toBe("60");
      expect(item2?.unit).toBe("ea");
      expect(item2?.unitPrice).toBe("$3.40");
      expect(item2?.amount).toBe("$204.00");

      // Item 3: RF-330
      const item3 = data.items.find((i) => i.code === "RF-330");
      expect(item3).toBeDefined();
      expect(item3?.quantity).toBe("10");
      expect(item3?.unit).toBe("box");
      expect(item3?.unitPrice).toBe("$46.50");
      expect(item3?.amount).toBe("$465.00");

      // Item 4: IN-045
      const item4 = data.items.find((i) => i.code === "IN-045");
      expect(item4).toBeDefined();
      expect(item4?.quantity).toBe("22");
      expect(item4?.unit).toBe("pack");
      expect(item4?.unitPrice).toBe("$61.00");
      expect(item4?.amount).toBe("$1,342.00");
    });

    // CASE B: IB-55902
    it("Case B: IB-55902 (Image-only PDF, OCR invoked, method=ocr, 3 items, no arithmetic correction)", async () => {
      const buffer = getFixtureBuffer("IB-55902.pdf");
      const req = createRequestWithBuffer(buffer, "IB-55902.pdf");
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      const { data } = json;
      expect(data.items).toHaveLength(3);

      // Verify OCR was used
      for (const item of data.items) {
        expect(item.page).toBe(1);
        expect(item.evidence?.amount?.method).toBe("ocr");
        expect(item.evidence?.amount?.confidence).toBeGreaterThan(80);
      }

      // Item 1: EL-902
      const item1 = data.items.find((i) => i.code === "EL-902");
      expect(item1).toBeDefined();
      expect(item1?.quantity).toBe("18");
      expect(item1?.unit).toBe("ea");
      expect(item1?.unitPrice).toBe("$34.00");
      expect(item1?.amount).toBe("$612.00");

      // Item 2: EL-770
      const item2 = data.items.find((i) => i.code === "EL-770");
      expect(item2).toBeDefined();
      expect(item2?.quantity).toBe("12");
      expect(item2?.unit).toBe("kit");
      expect(item2?.unitPrice).toBe("$21.50");
      expect(item2?.amount).toBe("$258.00");

      // Item 3: PL-114
      const item3 = data.items.find((i) => i.code === "PL-114");
      expect(item3).toBeDefined();
      expect(item3?.quantity).toBe("26");
      expect(item3?.unit).toBe("length");
      expect(item3?.unitPrice).toBe("$18.90");
      expect(item3?.amount).toBe("$491.40");
    }, 20000);

    // CASE C: IB-56010
    it("Case C: IB-56010 (Weight invoice with NO amount column; forbids derived amounts; preserves raw weights)", async () => {
      const buffer = getFixtureBuffer("IB-56010.pdf");
      const req = createRequestWithBuffer(buffer, "IB-56010.pdf");
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      const { data } = json;
      expect(data.items).toHaveLength(4);

      // FORBIDDEN AMOUNTS CHECK: $222.00, $40.00, $142.50, $48.80
      const serializedJson = JSON.stringify(data);
      expect(serializedJson).not.toContain('"$222.00"');
      expect(serializedJson).not.toContain('"$40.00"');
      expect(serializedJson).not.toContain('"$142.50"');
      expect(serializedJson).not.toContain('"$48.80"');

      for (const item of data.items) {
        expect(item.amount).toBeUndefined();
      }

      // Item 1: FX-401
      const item1 = data.items.find((i) => i.code === "FX-401");
      expect(item1).toBeDefined();
      expect(item1?.quantity).toBe("3");
      expect(item1?.weight).toBe("20kg"); // Exactly "20kg", not 20000g
      expect(item1?.unitPrice).toBe("$74.00 /carton");

      // Item 2: FX-402
      const item2 = data.items.find((i) => i.code === "FX-402");
      expect(item2).toBeDefined();
      expect(item2?.quantity).toBe("2000");
      expect(item2?.weight).toBe("640g total"); // Exactly "640g total", not 0.64kg
      expect(item2?.unitPrice).toBe("$0.02 /ea");

      // Item 3: AD-118
      const item3 = data.items.find((i) => i.code === "AD-118");
      expect(item3).toBeDefined();
      expect(item3?.quantity).toBe("5");
      expect(item3?.weight).toBe("1.4kg"); // Exactly "1.4kg", not 1400g
      expect(item3?.unitPrice).toBe("$28.50 /kit");

      // Item 4: AD-119
      const item4 = data.items.find((i) => i.code === "AD-119");
      expect(item4).toBeDefined();
      expect(item4?.quantity).toBe("8");
      expect(item4?.weight).toBe("500g"); // Exactly "500g", not 0.5kg
      expect(item4?.unitPrice).toBe("$6.10 /tub");
    });

    // CASE D: IB-56088
    it("Case D: IB-56088 (Contradiction 9 vs 11 cartons; 3 valid items preserved; HTTP 200)", async () => {
      const buffer = getFixtureBuffer("IB-56088.pdf");
      const req = createRequestWithBuffer(buffer, "IB-56088.pdf");
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      const { data } = json;
      expect(data.status).toBe("partial_success");

      // 3 Valid items preserved
      expect(data.items).toHaveLength(3);
      expect(data.items.map((i) => i.code)).toEqual(["EL-902", "EL-905", "PL-114"]);

      // Carton count contradiction
      expect(data.refusals).toHaveLength(1);
      const refusal = data.refusals[0];
      expect(refusal.reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
      expect(refusal.field).toBe("cartonCount");
      expect(refusal.evidence).toHaveLength(2);
      expect(refusal.evidence?.[0].sourceText).toContain("9 cartons dispatched");
      expect(refusal.evidence?.[1].sourceText).toContain("11 cartons picked and loaded");

      // Must NOT arbitrarily choose 9 or 11
      expect(refusal.message).toContain("Neither figure can be safely accepted");
    });

    // CASE E: IB-56150
    it("Case E: IB-56150 (Total inconsistency $1,501.80 != $1,460.50; 4 items preserved; HTTP 200)", async () => {
      const buffer = getFixtureBuffer("IB-56150.pdf");
      const req = createRequestWithBuffer(buffer, "IB-56150.pdf");
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      const { data } = json;
      expect(data.status).toBe("partial_success");

      // 4 Valid items preserved
      expect(data.items).toHaveLength(4);
      expect(data.items.map((i) => i.code)).toEqual(["PL-201", "PL-202", "PL-210", "PL-215"]);

      // Inconsistent total refusal surfaced
      expect(data.refusals).toHaveLength(1);
      const totalRefusal = data.refusals[0];
      expect(totalRefusal.reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
      expect(totalRefusal.field).toBe("total");
      expect(totalRefusal.evidence).toHaveLength(3);
      expect(totalRefusal.message).toBe(
        "The printed total conflicts with the subtotal and GST shown in the document. No total was selected as verified."
      );
      expect(totalRefusal.message).not.toContain("1,460.50");
      expect(totalRefusal.message).not.toContain("41.30");
      expect(totalRefusal.evidence?.[0].sourceText).toContain("$1,270.00");
      expect(totalRefusal.evidence?.[1].sourceText).toContain("$190.50");
      expect(totalRefusal.evidence?.[2].sourceText).toContain("$1,501.80");

      // Public JSON response must NEVER contain derived unsourced numbers
      const serializedJson = JSON.stringify(data);
      expect(serializedJson).not.toContain("1,460.50");
      expect(serializedJson).not.toContain("41.30");

      for (const item of data.items) {
        expect(item.amount).not.toBe("$1,460.50");
      }
    });

    // CASE F: IB-STMT47
    it("Case F: IB-STMT47 (8 pages, 24 items, native for 1-3 & 5-8, OCR for page 4 only)", async () => {
      const buffer = getFixtureBuffer("IB-STMT47.pdf");
      const req = createRequestWithBuffer(buffer, "IB-STMT47.pdf");
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      const { data } = json;
      expect(data.items).toHaveLength(24);
      expect(data.pages).toHaveLength(8);

      // Check expected codes per page
      const codes = data.items.map((i) => i.code);
      expect(codes.slice(0, 3)).toEqual(["CX-1000", "CX-1001", "CX-1002"]); // Page 1
      expect(codes.slice(3, 6)).toEqual(["CX-1010", "CX-1011", "CX-1012"]); // Page 2
      expect(codes.slice(6, 9)).toEqual(["CX-1020", "CX-1021", "CX-1022"]); // Page 3
      expect(codes.slice(9, 12)).toEqual(["CX-1030", "CX-1031", "CX-1032"]); // Page 4
      expect(codes.slice(12, 15)).toEqual(["CX-1040", "CX-1041", "CX-1042"]); // Page 5
      expect(codes.slice(15, 18)).toEqual(["CX-1050", "CX-1051", "CX-1052"]); // Page 6
      expect(codes.slice(18, 21)).toEqual(["CX-1060", "CX-1061", "CX-1062"]); // Page 7
      expect(codes.slice(21, 24)).toEqual(["CX-1070", "CX-1071", "CX-1072"]); // Page 8

      // Verify page 1-3 are native
      for (let i = 0; i < 9; i++) {
        expect(data.items[i].page).toBeLessThanOrEqual(3);
        expect(data.items[i].evidence?.amount?.method).toBe("native");
      }

      // Verify page 4 is OCR
      for (let i = 9; i < 12; i++) {
        expect(data.items[i].page).toBe(4);
        expect(data.items[i].evidence?.amount?.method).toBe("ocr");
      }

      // Verify pages 5-8 are native
      for (let i = 12; i < 24; i++) {
        expect(data.items[i].page).toBeGreaterThanOrEqual(5);
        expect(data.items[i].evidence?.amount?.method).toBe("native");
      }

      // Confirm no item exposes page 0
      for (const item of data.items) {
        expect(item.page).toBeGreaterThan(0);
        for (const ev of Object.values(item.evidence || {})) {
          expect(ev.page).toBeGreaterThan(0);
        }
      }
    }, 20000);
  });

  // =========================================================================
  // STEP 5: EVIDENCE INVARIANT AUDIT
  // =========================================================================
  describe("Step 5: Evidence Invariant Audit across All Extracted Samples", () => {
    it("ensures every single accepted numeric field has valid positive page, non-empty source text, and is grounded", async () => {
      const files = [
        "IB-55871.pdf",
        "IB-55902.pdf",
        "IB-56010.pdf",
        "IB-56088.pdf",
        "IB-56150.pdf",
        "IB-STMT47.pdf",
      ];

      let totalNumericFieldsAudited = 0;

      for (const filename of files) {
        const buffer = getFixtureBuffer(filename);
        const req = createRequestWithBuffer(buffer, filename);
        const res = await POST(req);
        const json = (await res.json()) as ApiSuccessResponse;

        for (const item of json.data.items) {
          for (const field of NUMERIC_BUSINESS_FIELDS) {
            const val = item[field];
            if (val !== undefined && val !== null) {
              totalNumericFieldsAudited++;
              const ev = item.evidence?.[field];

              // 1. Evidence exists
              expect(
                ev,
                `Field '${field}' on ${item.code} in ${filename} must have evidence`
              ).toBeDefined();

              // 2. Page is a positive integer (>= 1)
              expect(ev!.page).toBeGreaterThanOrEqual(1);

              // 3. Source text is non-empty
              expect(ev!.sourceText.trim().length).toBeGreaterThan(0);

              // 4. Source text is actual source text, not a generated sentence
              expect(ev!.sourceText).not.toContain("The numeric value");
              expect(ev!.sourceText).not.toContain("Calculated from");

              // 5. Value is authentically grounded in source text
              const isGrounded = isNumericValueGroundedInSource(val, ev!.sourceText);
              expect(
                isGrounded,
                `Value '${val}' for '${field}' in ${item.code} (${filename}) is not grounded in source text: "${ev!.sourceText}"`
              ).toBe(true);
            }
          }
        }
      }

      expect(totalNumericFieldsAudited).toBeGreaterThan(120);
    }, 35000);
  });

  // =========================================================================
  // STEP 7: FORCED PAGE FAILURE TEST
  // =========================================================================
  describe("Step 7: Forced Page Failure Test on IB-STMT47", () => {
    it("isolates page-4 OCR failure and returns 21 surviving items with HTTP 200", async () => {
      // Temporarily mock OCR failure for page 4
      const ocrSpy = vi
        .spyOn(ocrExtractor, "performOcrOnImageBuffer")
        .mockRejectedValueOnce(new Error("Simulated OCR worker crash on Page 4"));

      try {
        const buffer = getFixtureBuffer("IB-STMT47.pdf");
        const req = createRequestWithBuffer(buffer, "IB-STMT47.pdf");
        const res = await POST(req);

        // MUST be HTTP 200, never an HTTP 500
        expect(res.status).toBe(200);
        const json = (await res.json()) as ApiSuccessResponse;
        expect(json.ok).toBe(true);

        const { data } = json;
        expect(data.status).toBe("partial_success");

        // Exactly 21 surviving items (3 items * 7 native pages)
        expect(data.items).toHaveLength(21);

        // Page 4 items (CX-1030, CX-1031, CX-1032) must NOT be present
        expect(data.items.some((i) => i.code === "CX-1030")).toBe(false);
        expect(data.items.some((i) => i.code === "CX-1031")).toBe(false);
        expect(data.items.some((i) => i.code === "CX-1032")).toBe(false);

        // Pages 1-3 survive
        expect(data.items.some((i) => i.code === "CX-1000")).toBe(true);
        // Pages 5-8 survive
        expect(data.items.some((i) => i.code === "CX-1072")).toBe(true);

        // Refusal specifically for Page 4 exists
        const page4Refusal = data.refusals.find((r) => r.page === 4);
        expect(page4Refusal).toBeDefined();
        expect(page4Refusal?.reasonCode).toBe(RefusalCode.PAGE_EXTRACTION_FAILED);
        expect(page4Refusal?.message).toContain("Page 4 could not be extracted");
        expect(page4Refusal?.message).toContain("Simulated OCR worker crash");
      } finally {
        ocrSpy.mockRestore();
      }
    }, 20000);
  });

  // =========================================================================
  // STEP 8: MALFORMED ROW ISOLATION TEST
  // =========================================================================
  describe("Step 8: Malformed Row Isolation Test", () => {
    it("safely extracts AA-001 and AA-002 while skipping/isolating 'BROKEN ??? ???'", () => {
      const syntheticPageText = [
        "Code Description Qty Unit Unit Price Amount",
        "AA-001 Bolt 10 ea $2.00 $20.00",
        "BROKEN ??? ???",
        "AA-002 Nut 30 ea $1.00 $30.00",
      ].join("\n");

      const mockPage: ExtractedPage = {
        page: 1,
        text: syntheticPageText,
        method: "native",
        usable: true,
        wordCount: 15,
        characterCount: 120,
      };

      const { items, refusals } = parsePageLineItems(mockPage);

      // Both valid items are accepted
      expect(items).toHaveLength(2);
      expect(items[0].code).toBe("AA-001");
      expect(items[0].quantity).toBe("10");
      expect(items[0].amount).toBe("$20.00");

      expect(items[1].code).toBe("AA-002");
      expect(items[1].quantity).toBe("30");
      expect(items[1].amount).toBe("$30.00");

      // The broken row did NOT destroy neighboring valid rows
      expect(items[0].description).toBe("Bolt");
      expect(items[1].description).toBe("Nut");
    });
  });

  // =========================================================================
  // STEP 9: DESCRIPTION-NUMBER TESTS
  // =========================================================================
  describe("Step 9: Description-Number Tests", () => {
    it("does not mistake numbers inside descriptions for quantities (e.g. 15mm, 3m, 100mm)", () => {
      // Case 1: "PL-201 Copper pipe 15mm, 3m length 40 length $14.60 $584.00"
      const line1 =
        "PL-201 Copper pipe 15mm, 3m length 40 length $14.60 $584.00";
      const item1 = tokenizeCandidateRow(line1, 1, "native");
      expect(item1).toBeDefined();
      expect(item1?.code).toBe("PL-201");
      expect(item1?.description).toBe("Copper pipe 15mm, 3m length");
      expect(item1?.quantity).toBe("40"); // Quantity MUST be 40, NOT 15 or 3!
      expect(item1?.unit).toBe("length");
      expect(item1?.unitPrice).toBe("$14.60");
      expect(item1?.amount).toBe("$584.00");

      // Case 2: "PL-114 PVC waste pipe 100mm, 3m length 20 length $18.90 $378.00"
      const line2 =
        "PL-114 PVC waste pipe 100mm, 3m length 20 length $18.90 $378.00";
      const item2 = tokenizeCandidateRow(line2, 1, "native");
      expect(item2).toBeDefined();
      expect(item2?.code).toBe("PL-114");
      expect(item2?.description).toBe("PVC waste pipe 100mm, 3m length");
      expect(item2?.quantity).toBe("20"); // Quantity MUST be 20, NOT 100 or 3!
      expect(item2?.unit).toBe("length");
      expect(item2?.unitPrice).toBe("$18.90");
      expect(item2?.amount).toBe("$378.00");
    });

    it("ensures product codes (FX-401, PL-114, CX-1072) do not contaminate numeric validation", () => {
      const source = "FX-401 Coach screws 3 carton $74.00 /carton";
      const item: LineItem = {
        code: "FX-401",
        description: "Coach screws",
        quantity: "3",
        unitPrice: "$74.00 /carton",
      };

      const result = validateLineItemEvidence(item, {
        pageSourceText: source,
        page: 1,
      });

      expect(result.valid).toBe(true);
      expect(result.refusals).toHaveLength(0);
      expect(result.item.code).toBe("FX-401");
      expect(result.item.quantity).toBe("3");

      // Code 401 should not be matched as quantity if candidate was falsely 401
      expect(isNumericValueGroundedInSource("401", source)).toBe(false);
      expect(isNumericValueGroundedInSource("4", source)).toBe(false);
      expect(isNumericValueGroundedInSource("1", source)).toBe(false);
    });
  });

  // =========================================================================
  // STEP 10: TOTAL/HEADER/FOOTER CLASSIFICATION
  // =========================================================================
  describe("Step 10: Total/Header/Footer Classification", () => {
    it("never classifies headers, footers, totals, or metadata as line items", () => {
      const nonLineItemRows = [
        "Subtotal: $1,270.00",
        "GST (15%): $190.50",
        "Total (incl GST): $1,501.80",
        "Date: 5 August 2026",
        "Document No: IB-55871",
        "Page 1 of 1",
        "Tax Invoice",
        "Ironbark Trade Merchants Ltd",
        "Coastal Build Co",
        "------------------------------------",
        "====================================",
        "Code Description Qty Unit Unit Price Amount",
      ];

      for (const row of nonLineItemRows) {
        const classification = classifyRow(row);
        expect(
          classification,
          `Row "${row}" was misclassified as LINE_ITEM`
        ).not.toBe("LINE_ITEM");
      }
    });
  });

  // =========================================================================
  // STEP 11: REQUEST/API VALIDATION TESTS
  // =========================================================================
  describe("Step 11: API Request-Level Validation Matrix (10 Scenarios)", () => {
    // 1. Valid PDF
    it("Scenario 1: Valid PDF -> HTTP 200", async () => {
      const buffer = getFixtureBuffer("IB-55871.pdf");
      const req = createRequestWithBuffer(buffer, "IB-55871.pdf");
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    // 2. Missing file
    it("Scenario 2: Missing file -> HTTP 400 with specific message", async () => {
      const formData = new FormData(); // empty
      const req = new NextRequest("http://localhost:3000/api/extract", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as ApiErrorResponse;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe(ApiErrorCode.MISSING_FILE);
      expect(json.error.message).toContain("No file uploaded");
    });

    // 3. Text file (.txt)
    it("Scenario 3: Text file -> HTTP 415 reject", async () => {
      const textBuffer = Buffer.from("Hello, I am a plain text file.");
      const req = createRequestWithBuffer(textBuffer, "notes.txt", "text/plain");
      const res = await POST(req);
      expect(res.status).toBe(415);
      const json = (await res.json()) as ApiErrorResponse;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
      expect(json.error.message).toContain("%PDF-");
    });

    // 4. Text file renamed to .pdf
    it("Scenario 4: Text file renamed to .pdf -> HTTP 415 reject (magic bytes checked)", async () => {
      const fakePdfBuffer = Buffer.from("Not really a PDF file content");
      const req = createRequestWithBuffer(fakePdfBuffer, "fake.pdf", "application/pdf");
      const res = await POST(req);
      expect(res.status).toBe(415);
      const json = (await res.json()) as ApiErrorResponse;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
    });

    // 5. Zero-byte file
    it("Scenario 5: Zero-byte file -> HTTP 400 reject", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const req = createRequestWithBuffer(emptyBuffer, "empty.pdf", "application/pdf");
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as ApiErrorResponse;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe(ApiErrorCode.EMPTY_FILE);
      expect(json.error.message).toContain("empty (0 bytes)");
    });

    // 6. Corrupt PDF
    it("Scenario 6: Corrupt PDF -> HTTP 422 reject with unreadable/corrupt message", async () => {
      const corruptBuffer = Buffer.from("%PDF-1.4\nBROKEN_UNREADABLE_STREAM_CONTENT");
      const req = createRequestWithBuffer(corruptBuffer, "corrupt.pdf", "application/pdf");
      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = (await res.json()) as ApiErrorResponse;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe(ApiErrorCode.CORRUPT_PDF_FILE);
      expect(json.error.message).toContain("could not be read or is corrupted");
    });

    // 7. Oversized PDF (>4MB)
    it("Scenario 7: Oversized PDF (>4MB) -> HTTP 413 reject with limit explanation", async () => {
      const oversizedBuffer = new Uint8Array(MAX_FILE_SIZE_BYTES + 2048);
      const req = createRequestWithBuffer(oversizedBuffer, "large.pdf", "application/pdf");
      const res = await POST(req);
      expect(res.status).toBe(413);
      const json = (await res.json()) as ApiErrorResponse;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe(ApiErrorCode.FILE_TOO_LARGE);
      expect(json.error.message).toContain("exceeds the 4MB limit for serverless processing");
    });

    // 8. Domain refusal document (IB-56088)
    it("Scenario 8: Domain refusal document (IB-56088) -> HTTP 200 with items + refusals", async () => {
      const buffer = getFixtureBuffer("IB-56088.pdf");
      const req = createRequestWithBuffer(buffer, "IB-56088.pdf");
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);
      expect(json.data.items).toHaveLength(3);
      expect(json.data.refusals).toHaveLength(1);
    });

    // 9. Arithmetic inconsistency document (IB-56150)
    it("Scenario 9: Arithmetic inconsistency document (IB-56150) -> HTTP 200 with items + refusal", async () => {
      const buffer = getFixtureBuffer("IB-56150.pdf");
      const req = createRequestWithBuffer(buffer, "IB-56150.pdf");
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);
      expect(json.data.items).toHaveLength(4);
      expect(json.data.refusals).toHaveLength(1);
    });

    // 10. Partial page failure (IB-STMT47 page 4 failure)
    it("Scenario 10: Partial page failure -> HTTP 200 with surviving items + page refusal", async () => {
      const ocrSpy = vi
        .spyOn(ocrExtractor, "performOcrOnImageBuffer")
        .mockRejectedValueOnce(new Error("Partial OCR engine failure"));

      try {
        const buffer = getFixtureBuffer("IB-STMT47.pdf");
        const req = createRequestWithBuffer(buffer, "IB-STMT47.pdf");
        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = (await res.json()) as ApiSuccessResponse;
        expect(json.ok).toBe(true);
        expect(json.data.items).toHaveLength(21);
        expect(json.data.refusals.some((r) => r.page === 4)).toBe(true);
      } finally {
        ocrSpy.mockRestore();
      }
    });

    // Check that every error message is non-generic
    it("confirms no API error returns generic 'Something went wrong'", async () => {
      const errorScenarios = [
        new FormData(), // Missing file
        (() => {
          const fd = new FormData();
          fd.append("file", new File([], "empty.pdf"));
          return fd;
        })(), // Empty file
        (() => {
          const fd = new FormData();
          fd.append("file", new File(["txt"], "doc.txt", { type: "text/plain" }));
          return fd;
        })(), // Text file
      ];

      for (const fd of errorScenarios) {
        const req = new NextRequest("http://localhost:3000/api/extract", {
          method: "POST",
          body: fd,
        });
        const res = await POST(req);
        const json = (await res.json()) as ApiErrorResponse;
        expect(json.error.message).not.toMatch(/^something went wrong$/i);
        expect(json.error.code).toBeDefined();
        expect(json.error.message.length).toBeGreaterThan(10);
      }
    });
  });
});
