import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  extractNativePdfPages,
  evaluatePageUsability,
  InvalidPdfDocumentError,
} from "@/extraction/pdf/native-extractor";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

function readFixture(filename: string): Buffer {
  const filePath = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

describe("Native PDF Page Extractor", () => {
  describe("Usability Heuristic", () => {
    it("classifies empty or near-empty text as image-only / requiring OCR", () => {
      const emptyResult = evaluatePageUsability("", 0);
      expect(emptyResult.usable).toBe(false);
      expect(emptyResult.requiresOcr).toBe(true);

      const whitespaceResult = evaluatePageUsability("   \n\t  ", 2);
      expect(whitespaceResult.usable).toBe(false);
      expect(whitespaceResult.requiresOcr).toBe(true);

      const sparseResult = evaluatePageUsability("Page 1", 1);
      expect(sparseResult.usable).toBe(false);
      expect(sparseResult.requiresOcr).toBe(true);
    });

    it("classifies standard invoice text as usable native text", () => {
      const invoiceText =
        "Ironbark Trade Merchants Ltd Tax Invoice Document No: IB-55871 Date: 5 August 2026 Code Description Qty Unit Unit Price Amount FX-201 Framing nail gun coil 24 box $52.00 $1,248.00";
      const result = evaluatePageUsability(invoiceText, 40);
      expect(result.usable).toBe(true);
      expect(result.requiresOcr).toBe(false);
      expect(result.wordCount).toBeGreaterThan(10);
    });
  });

  describe("Malformed Input Handling", () => {
    it("rejects empty buffers", async () => {
      await expect(extractNativePdfPages(Buffer.alloc(0))).rejects.toThrow(
        InvalidPdfDocumentError
      );
    });

    it("rejects non-PDF data (invalid header)", async () => {
      const nonPdfBuffer = Buffer.from("<html><body>Not a PDF</body></html>");
      await expect(extractNativePdfPages(nonPdfBuffer)).rejects.toThrow(
        InvalidPdfDocumentError
      );
    });
  });

  describe("Assessment PDF Fixtures Verification", () => {
    // Fixture 1: IB-55871
    it("extracts native text faithfully from IB-55871", async () => {
      const buffer = readFixture("IB-55871.pdf");
      const result = await extractNativePdfPages(buffer);

      expect(result.totalPages).toBe(1);
      expect(result.usablePages).toBe(1);
      expect(result.ocrRequiredPages).toBe(0);

      const page1 = result.pages[0];
      expect(page1.page).toBe(1);
      expect(page1.usable).toBe(true);
      expect(page1.requiresOcr).toBe(false);
      expect(page1.method).toBe("native");

      // Fidelity check: exact tokens must exist without normalization
      expect(page1.text).toContain("IB-55871");
      expect(page1.text).toContain("Coastal Build Co");
      expect(page1.text).toContain("FX-201");
      expect(page1.text).toContain("$52.00");
      expect(page1.text).toContain("$1,248.00");
    });

    // Fixture 2: IB-56010
    it("extracts native text faithfully from IB-56010", async () => {
      const buffer = readFixture("IB-56010.pdf");
      const result = await extractNativePdfPages(buffer);

      expect(result.totalPages).toBe(1);
      expect(result.usablePages).toBe(1);
      expect(result.ocrRequiredPages).toBe(0);

      const page1 = result.pages[0];
      expect(page1.page).toBe(1);
      expect(page1.usable).toBe(true);
      expect(page1.requiresOcr).toBe(false);
      expect(page1.text).toContain("IB-56010");
    });

    // Fixture 3: IB-56088
    it("extracts native text faithfully from IB-56088", async () => {
      const buffer = readFixture("IB-56088.pdf");
      const result = await extractNativePdfPages(buffer);

      expect(result.totalPages).toBe(1);
      expect(result.usablePages).toBe(1);
      expect(result.ocrRequiredPages).toBe(0);

      const page1 = result.pages[0];
      expect(page1.page).toBe(1);
      expect(page1.usable).toBe(true);
      expect(page1.requiresOcr).toBe(false);
      expect(page1.text).toContain("IB-56088");
    });

    // Fixture 4: IB-56150
    it("extracts native text faithfully from IB-56150", async () => {
      const buffer = readFixture("IB-56150.pdf");
      const result = await extractNativePdfPages(buffer);

      expect(result.totalPages).toBe(1);
      expect(result.usablePages).toBe(1);
      expect(result.ocrRequiredPages).toBe(0);

      const page1 = result.pages[0];
      expect(page1.page).toBe(1);
      expect(page1.usable).toBe(true);
      expect(page1.requiresOcr).toBe(false);
      expect(page1.text).toContain("IB-56150");
    });

    // Fixture 5: IB-55902 (CRITICAL EXPECTATION: Page 1 requires OCR)
    it("detects IB-55902 as image-only / requiring OCR on page 1", async () => {
      const buffer = readFixture("IB-55902.pdf");
      const result = await extractNativePdfPages(buffer);

      expect(result.totalPages).toBe(1);
      expect(result.usablePages).toBe(0);
      expect(result.ocrRequiredPages).toBe(1);

      const page1 = result.pages[0];
      expect(page1.page).toBe(1);
      expect(page1.usable).toBe(false);
      expect(page1.requiresOcr).toBe(true);
      expect(page1.text).toBe("");
    });

    // Fixture 6: IB-STMT47 (CRITICAL EXPECTATION: Page 4 requires OCR, others native)
    it("preserves native text for pages 1,2,3,5,6,7,8 and flags page 4 for OCR on IB-STMT47", async () => {
      const buffer = readFixture("IB-STMT47.pdf");
      const result = await extractNativePdfPages(buffer);

      expect(result.totalPages).toBe(8);
      expect(result.usablePages).toBe(7);
      expect(result.ocrRequiredPages).toBe(1);
      expect(result.pages).toHaveLength(8);

      // Verify sequential page numbering and isolation
      for (let i = 0; i < 8; i++) {
        expect(result.pages[i].page).toBe(i + 1);
      }

      // Pages 1, 2, 3 must have usable native text
      expect(result.pages[0].usable).toBe(true);
      expect(result.pages[0].requiresOcr).toBe(false);
      expect(result.pages[0].text).toContain("IB-STMT47");

      expect(result.pages[1].usable).toBe(true);
      expect(result.pages[1].requiresOcr).toBe(false);

      expect(result.pages[2].usable).toBe(true);
      expect(result.pages[2].requiresOcr).toBe(false);

      // Page 4 MUST be detected as requiring OCR
      expect(result.pages[3].page).toBe(4);
      expect(result.pages[3].usable).toBe(false);
      expect(result.pages[3].requiresOcr).toBe(true);
      expect(result.pages[3].text).toBe("");

      // Pages 5, 6, 7, 8 must have usable native text
      expect(result.pages[4].usable).toBe(true);
      expect(result.pages[4].requiresOcr).toBe(false);

      expect(result.pages[5].usable).toBe(true);
      expect(result.pages[5].requiresOcr).toBe(false);

      expect(result.pages[6].usable).toBe(true);
      expect(result.pages[6].requiresOcr).toBe(false);

      expect(result.pages[7].usable).toBe(true);
      expect(result.pages[7].requiresOcr).toBe(false);
    });
  });
});
