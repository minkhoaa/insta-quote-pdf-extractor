import { describe, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { extractNativePdfPages } from "@/extraction/pdf/native-extractor";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");
const PDF_FILES = [
  "IB-55871.pdf",
  "IB-55902.pdf",
  "IB-56010.pdf",
  "IB-56088.pdf",
  "IB-56150.pdf",
  "IB-STMT47.pdf",
];

describe("Assessment PDFs Diagnostic Run", () => {
  it("generates diagnostic metrics across all six assessment PDFs", async () => {
    console.log("\n=== COMPACT DIAGNOSTIC TABLE ===");
    console.log(
      "| Filename | Page Count | Native Usable Pages | Pages Requiring OCR | Errors |"
    );
    console.log("|---|---|---|---|---|");

    for (const filename of PDF_FILES) {
      const filePath = path.join(FIXTURES_DIR, filename);
      const buffer = fs.readFileSync(filePath);
      const result = await extractNativePdfPages(buffer);

      const usablePagesList =
        result.pages
          .filter((p) => p.usable)
          .map((p) => p.page)
          .join(", ") || "None";

      const ocrPagesList =
        result.pages
          .filter((p) => p.requiresOcr)
          .map((p) => p.page)
          .join(", ") || "None";

      const errorsList =
        result.pages
          .filter((p) => p.error)
          .map((p) => `p${p.page}: ${p.error}`)
          .join("; ") || "None";

      console.log(
        `| \`${filename}\` | ${result.totalPages} | ${usablePagesList} (${result.usablePages}) | ${ocrPagesList} (${result.ocrRequiredPages}) | ${errorsList} |`
      );
    }
  });
});
