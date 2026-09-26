import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { isNumericValueGroundedInSource } from "@/domain/validation";
import { extractDocumentPages } from "@/extraction/pipeline";
import { parseExtractedDocument } from "@/extraction/parser";
import { POST } from "@/app/api/extract/route";
import { NextRequest } from "next/server";
import { type ApiSuccessResponse } from "@/domain/api-contracts";
import { RefusalCode } from "@/domain/refusal";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

describe("Focused Safety & Grounding Regression Tests", () => {
  describe("Check 1: Evidence Gate False-Positive Prevention", () => {
    it("strictly returns false for partial numeric slices, percentages, and delimited numbers", () => {
      // 1. Partial slice before decimal: "74" inside "$74.00" must be false
      expect(
        isNumericValueGroundedInSource(
          "74",
          "FX-401 Coach screws 3 carton $74.00 /carton"
        )
      ).toBe(false);

      // 2. Partial digit before comma: "1" inside "$1,248.00" must be false
      expect(
        isNumericValueGroundedInSource(
          "1",
          "FX-201 Nail gun 24 box $52.00 $1,248.00"
        )
      ).toBe(false);

      // 3. Comma-separated inner slice: "248" inside "$1,248.00" must be false
      expect(
        isNumericValueGroundedInSource(
          "248",
          "FX-201 Nail gun 24 box $52.00 $1,248.00"
        )
      ).toBe(false);

      // 4. Percentage tax rate in parentheses: "15" inside "GST (15%): $190.50" must be false
      expect(
        isNumericValueGroundedInSource("15", "GST (15%): $190.50")
      ).toBe(false);

      // 5. Partial slice before decimal: "190" inside "$190.50" must be false
      expect(
        isNumericValueGroundedInSource("190", "GST (15%): $190.50")
      ).toBe(false);

      // 6. Substring within product code: "401" inside "FX-401" must be false
      expect(
        isNumericValueGroundedInSource(
          "401",
          "FX-401 Coach screws 3 carton $74.00 /carton"
        )
      ).toBe(false);
    });

    it("strictly returns true for authentic standalone numbers and prices", () => {
      // 1. Standalone quantity "3"
      expect(
        isNumericValueGroundedInSource(
          "3",
          "FX-401 Coach screws 3 carton $74.00 /carton"
        )
      ).toBe(true);

      // 2. Unit price "$74.00"
      expect(
        isNumericValueGroundedInSource(
          "$74.00",
          "FX-401 Coach screws 3 carton $74.00 /carton"
        )
      ).toBe(true);

      // 3. Formatted currency "$1,248.00"
      expect(
        isNumericValueGroundedInSource(
          "$1,248.00",
          "FX-201 Nail gun 24 box $52.00 $1,248.00"
        )
      ).toBe(true);
    });
  });

  describe("Check 2: IB-56150 Derived Numbers Never Leaked to Public Output", () => {
    it("ensures public output contains only source numbers and never derived sums ($1,460.50, $41.30)", async () => {
      const pdfBuffer = fs.readFileSync(path.join(FIXTURES_DIR, "IB-56150.pdf"));
      const pipelineRes = await extractDocumentPages(pdfBuffer);
      const extractionResult = parseExtractedDocument(pipelineRes);

      // 1. Line items are preserved
      expect(extractionResult.items).toHaveLength(4);

      // 2. Exactly 1 refusal for total contradiction
      expect(extractionResult.refusals).toHaveLength(1);
      const refusal = extractionResult.refusals[0];
      expect(refusal.reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
      expect(refusal.field).toBe("total");

      // 3. Expected user-facing refusal text
      expect(refusal.message).toBe(
        "The printed total conflicts with the subtotal and GST shown in the document. No total was selected as verified."
      );

      // 4. Refusal evidence contains ONLY actual printed source lines
      expect(refusal.evidence).toHaveLength(3);
      expect(refusal.evidence?.[0].sourceText).toContain("Subtotal: $1,270.00");
      expect(refusal.evidence?.[1].sourceText).toContain("GST (15%): $190.50");
      expect(refusal.evidence?.[2].sourceText).toContain("Total (incl GST): $1,501.80");

      // 5. Test live API Route Handler JSON payload
      const file = new File([new Uint8Array(pdfBuffer)], "IB-56150.pdf", {
        type: "application/pdf",
      });
      const formData = new FormData();
      formData.append("file", file);
      const req = new NextRequest("http://localhost:3000/api/extract", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as ApiSuccessResponse;
      expect(json.ok).toBe(true);

      // STRICT INVARIANT: Serialized JSON MUST NOT contain derived numbers
      const serializedJson = JSON.stringify(json.data);
      expect(serializedJson).not.toContain("1,460.50");
      expect(serializedJson).not.toContain("41.30");
      expect(serializedJson).not.toContain("$1,460.50");
      expect(serializedJson).not.toContain("$41.30");
    });
  });
});
