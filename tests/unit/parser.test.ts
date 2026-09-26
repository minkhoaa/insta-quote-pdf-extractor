import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { extractDocumentPages } from "@/extraction/pipeline";
import { parseExtractedDocument } from "@/extraction/parser";
import { RefusalCode } from "@/domain/refusal";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

function readFixture(filename: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename));
}

describe("Deterministic Line-Item Parser & Contradiction Engine", () => {
  // Test 1: Clean invoice row extraction (IB-55871)
  it("extracts 4 clean line items with verifiable numeric evidence (IB-55871)", async () => {
    const buffer = readFixture("IB-55871.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    expect(result.items).toHaveLength(4);
    expect(result.refusals).toHaveLength(0);
    expect(result.status).toBe("success");

    const item1 = result.items[0];
    expect(item1.code).toBe("FX-201");
    expect(item1.description).toBe("Framing nail gun coil, 90mm galv");
    expect(item1.quantity).toBe("24");
    expect(item1.unit).toBe("box");
    expect(item1.unitPrice).toBe("$52.00");
    expect(item1.amount).toBe("$1,248.00");

    // Every numeric field must have valid evidence
    expect(item1.evidence?.quantity?.sourceText).toContain("24");
    expect(item1.evidence?.unitPrice?.sourceText).toContain("$52.00");
    expect(item1.evidence?.amount?.sourceText).toContain("$1,248.00");
    expect(item1.evidence?.amount?.method).toBe("native");
  });

  // Test 2: OCR row extraction (IB-55902)
  it("extracts 3 line items via local OCR fallback with method='ocr' (IB-55902)", async () => {
    const buffer = readFixture("IB-55902.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    expect(result.items).toHaveLength(3);
    expect(result.items[0].code).toBe("EL-902");
    expect(result.items[0].quantity).toBe("18");
    expect(result.items[0].amount).toBe("$612.00");
    expect(result.items[0].evidence?.amount?.method).toBe("ocr");
    expect(result.items[0].evidence?.amount?.confidence).toBeGreaterThan(80);

    expect(result.items[1].code).toBe("EL-770");
    expect(result.items[1].quantity).toBe("12");

    expect(result.items[2].code).toBe("PL-114");
    expect(result.items[2].quantity).toBe("26");
  }, 15000);

  // Test 3 & 4: No amount derivation & Raw weight preservation (IB-56010)
  it("extracts 4 items without deriving amounts and preserves raw weights (IB-56010)", async () => {
    const buffer = readFixture("IB-56010.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    expect(result.items).toHaveLength(4);

    // Item 1: 3 x $74.00
    const item1 = result.items[0];
    expect(item1.code).toBe("FX-401");
    expect(item1.quantity).toBe("3");
    expect(item1.weight).toBe("20kg");
    expect(item1.unitPrice).toBe("$74.00 /carton");
    // STRICT: Amount must be UNDEFINED — NEVER derived as $222.00
    expect(item1.amount).toBeUndefined();

    // Item 2: Washers 2000 loose 640g total
    const item2 = result.items[1];
    expect(item2.code).toBe("FX-402");
    expect(item2.quantity).toBe("2000");
    expect(item2.weight).toBe("640g total");
    expect(item2.unitPrice).toBe("$0.02 /ea");
    expect(item2.amount).toBeUndefined();

    // Item 3: Epoxy resin 5 1.4kg
    const item3 = result.items[2];
    expect(item3.code).toBe("AD-118");
    expect(item3.quantity).toBe("5");
    expect(item3.weight).toBe("1.4kg");
    expect(item3.amount).toBeUndefined();

    // Item 4: Filler compound 8 500g
    const item4 = result.items[3];
    expect(item4.code).toBe("AD-119");
    expect(item4.quantity).toBe("8");
    expect(item4.weight).toBe("500g");
    expect(item4.amount).toBeUndefined();
  });

  // Test 5: 9 vs 11 carton contradiction (IB-56088)
  it("extracts 3 line items and flags 9 vs 11 carton count contradiction (IB-56088)", async () => {
    const buffer = readFixture("IB-56088.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    // 3 valid line items
    expect(result.items).toHaveLength(3);
    expect(result.items[0].code).toBe("EL-902");
    expect(result.items[1].code).toBe("EL-905");
    expect(result.items[2].code).toBe("PL-114");

    // Carton contradiction refusal
    expect(result.refusals).toHaveLength(1);
    const refusal = result.refusals[0];
    expect(refusal.reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
    expect(refusal.field).toBe("cartonCount");
    expect(refusal.page).toBe(1);
    expect(refusal.evidence).toBeDefined();
    expect(refusal.evidence).toHaveLength(2);
    expect(refusal.evidence?.[0].sourceText).toContain("9 cartons dispatched");
    expect(refusal.evidence?.[1].sourceText).toContain("11 cartons picked and loaded");
    expect(refusal.message).toContain("Conflicting carton counts");
  });

  // Test 6: Inconsistent invoice total (IB-56150)
  it("extracts 4 line items and flags printed total contradiction with subtotal + GST (IB-56150)", async () => {
    const buffer = readFixture("IB-56150.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    expect(result.items).toHaveLength(4);
    expect(result.items[0].code).toBe("PL-201");
    expect(result.items[1].code).toBe("PL-202");
    expect(result.items[2].code).toBe("PL-210");
    expect(result.items[3].code).toBe("PL-215");

    // Total arithmetic contradiction refusal
    expect(result.refusals).toHaveLength(1);
    const totalRefusal = result.refusals[0];
    expect(totalRefusal.reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
    expect(totalRefusal.field).toBe("total");
    expect(totalRefusal.page).toBe(1);
    expect(totalRefusal.evidence).toHaveLength(3);
    expect(totalRefusal.evidence?.[0].sourceText).toContain("$1,270.00");
    expect(totalRefusal.evidence?.[1].sourceText).toContain("$190.50");
    expect(totalRefusal.evidence?.[2].sourceText).toContain("$1,501.80");
    expect(totalRefusal.message).toContain("contradicts the arithmetic sum");
  });

  // Test 7: Multi-page statement and OCR isolation (IB-STMT47)
  it("extracts exactly 24 line items across 8 pages with page 4 via OCR (IB-STMT47)", async () => {
    const buffer = readFixture("IB-STMT47.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    expect(result.items).toHaveLength(24);
    expect(result.pages).toHaveLength(8);

    // Page 1 to 3 items should have native evidence
    for (let i = 0; i < 9; i++) {
      expect(result.items[i].evidence?.amount?.method).toBe("native");
    }

    // Page 4 items (indices 9, 10, 11) should have OCR evidence
    expect(result.items[9].code).toBe("CX-1030");
    expect(result.items[9].evidence?.amount?.method).toBe("ocr");
    expect(result.items[10].code).toBe("CX-1031");
    expect(result.items[10].evidence?.amount?.method).toBe("ocr");
    expect(result.items[11].code).toBe("CX-1032");
    expect(result.items[11].evidence?.amount?.method).toBe("ocr");

    // Pages 5 to 8 items should have native evidence
    for (let i = 12; i < 24; i++) {
      expect(result.items[i].evidence?.amount?.method).toBe("native");
    }
  }, 15000);

  // Test 8: All accepted numeric fields pass evidence validation
  it("ensures every single extracted numeric field passes evidence validation", async () => {
    const buffer = readFixture("IB-55871.pdf");
    const pipelineRes = await extractDocumentPages(buffer);
    const result = parseExtractedDocument(pipelineRes);

    for (const item of result.items) {
      if (item.quantity) {
        expect(item.evidence?.quantity).toBeDefined();
        expect(item.evidence?.quantity.sourceText).toContain(item.quantity);
      }
      if (item.unitPrice) {
        expect(item.evidence?.unitPrice).toBeDefined();
        expect(item.evidence?.unitPrice.sourceText).toContain(item.unitPrice);
      }
      if (item.amount) {
        expect(item.evidence?.amount).toBeDefined();
        expect(item.evidence?.amount.sourceText).toContain(item.amount);
      }
    }
  });
});
