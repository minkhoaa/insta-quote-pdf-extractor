import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { extractDocumentPages } from "@/extraction/pipeline";
import * as ocrExtractor from "@/extraction/ocr/ocr-extractor";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

function readFixture(filename: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename));
}

describe("Document Extraction Pipeline (Native + Local OCR Fallback)", () => {
  // Test 1: Native pages do NOT invoke OCR
  it("processes native PDF documents without invoking OCR (IB-55871)", async () => {
    const buffer = readFixture("IB-55871.pdf");
    const result = await extractDocumentPages(buffer);

    expect(result.totalPages).toBe(1);
    expect(result.nativePagesCount).toBe(1);
    expect(result.ocrPagesCount).toBe(0);
    expect(result.failedPagesCount).toBe(0);

    const page1 = result.pages[0];
    expect(page1.method).toBe("native");
    expect(page1.confidence).toBeUndefined(); // Confidence only exists for OCR
    expect(page1.text).toContain("IB-55871");
    expect(page1.text).toContain("FX-201");
  });

  it("processes native PDF documents without invoking OCR (IB-56010)", async () => {
    const buffer = readFixture("IB-56010.pdf");
    const result = await extractDocumentPages(buffer);

    expect(result.totalPages).toBe(1);
    expect(result.nativePagesCount).toBe(1);
    expect(result.ocrPagesCount).toBe(0);
    expect(result.pages[0].method).toBe("native");
  });

  it("processes native PDF documents without invoking OCR (IB-56088)", async () => {
    const buffer = readFixture("IB-56088.pdf");
    const result = await extractDocumentPages(buffer);

    expect(result.totalPages).toBe(1);
    expect(result.nativePagesCount).toBe(1);
    expect(result.ocrPagesCount).toBe(0);
    expect(result.pages[0].method).toBe("native");
  });

  it("processes native PDF documents without invoking OCR (IB-56150)", async () => {
    const buffer = readFixture("IB-56150.pdf");
    const result = await extractDocumentPages(buffer);

    expect(result.totalPages).toBe(1);
    expect(result.nativePagesCount).toBe(1);
    expect(result.ocrPagesCount).toBe(0);
    expect(result.pages[0].method).toBe("native");
  });

  // Test 2: Image-only page invokes OCR and records method = "ocr" (IB-55902)
  it("invokes local OCR fallback on scanned image-only PDF (IB-55902)", async () => {
    const buffer = readFixture("IB-55902.pdf");
    const result = await extractDocumentPages(buffer);

    expect(result.totalPages).toBe(1);
    expect(result.nativePagesCount).toBe(0);
    expect(result.ocrPagesCount).toBe(1);
    expect(result.failedPagesCount).toBe(0);

    const page1 = result.pages[0];
    expect(page1.page).toBe(1);
    expect(page1.method).toBe("ocr");
    expect(page1.usable).toBe(true);
    expect(page1.confidence).toBeDefined();
    expect(page1.confidence).toBeGreaterThan(80);

    // Verify verbatim extracted tokens from OCR
    expect(page1.text).toContain("IB-55902");
    expect(page1.text).toContain("Northline Plumbing & Electrical");
    expect(page1.text).toContain("EL-902");
    expect(page1.text).toContain("$612.00");
  }, 15000);

  // Test 3: Mixed document (IB-STMT47) - Only Page 4 invokes OCR, others remain native
  it("processes mixed multi-page statement: native text for pages 1-3,5-8 and OCR for page 4 (IB-STMT47)", async () => {
    const buffer = readFixture("IB-STMT47.pdf");
    const result = await extractDocumentPages(buffer);

    expect(result.totalPages).toBe(8);
    expect(result.nativePagesCount).toBe(7);
    expect(result.ocrPagesCount).toBe(1);
    expect(result.failedPagesCount).toBe(0);

    // Pages 1, 2, 3 must be native
    expect(result.pages[0].method).toBe("native");
    expect(result.pages[1].method).toBe("native");
    expect(result.pages[2].method).toBe("native");

    // Page 4 MUST be OCR
    const page4 = result.pages[3];
    expect(page4.page).toBe(4);
    expect(page4.method).toBe("ocr");
    expect(page4.usable).toBe(true);
    expect(page4.confidence).toBeGreaterThan(80);
    expect(page4.text).toContain("IB-STMT47");
    expect(page4.text).toContain("CX-1030");

    // Pages 5, 6, 7, 8 must be native
    expect(result.pages[4].method).toBe("native");
    expect(result.pages[5].method).toBe("native");
    expect(result.pages[6].method).toBe("native");
    expect(result.pages[7].method).toBe("native");
  }, 15000);

  // Test 4: OCR Failure Isolation
  it("isolates OCR failure on a page without destroying native pages in document", async () => {
    const buffer = readFixture("IB-STMT47.pdf");

    // Mock performOcrOnImageBuffer to simulate failure on page 4
    const spy = vi
      .spyOn(ocrExtractor, "performOcrOnImageBuffer")
      .mockRejectedValueOnce(new Error("Simulated OCR engine timeout"));

    try {
      const result = await extractDocumentPages(buffer);

      expect(result.totalPages).toBe(8);
      // All 7 native pages are preserved and usable!
      expect(result.nativePagesCount).toBe(7);
      expect(result.ocrPagesCount).toBe(0);
      expect(result.failedPagesCount).toBe(1);

      // Page 4 records the failure
      const page4 = result.pages[3];
      expect(page4.page).toBe(4);
      expect(page4.usable).toBe(false);
      expect(page4.error).toContain("Simulated OCR engine timeout");

      // Page 1 is still completely valid
      expect(result.pages[0].usable).toBe(true);
      expect(result.pages[0].text).toContain("IB-STMT47");
    } finally {
      spy.mockRestore();
    }
  }, 15000);
});
