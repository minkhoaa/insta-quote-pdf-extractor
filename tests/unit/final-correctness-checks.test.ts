import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/extract/route";
import { isNumericValueGroundedInSource } from "@/domain/validation";
import { type ApiSuccessResponse } from "@/domain/api-contracts";

const FIXTURES = path.resolve(__dirname, "../fixtures/pdfs");

describe("FINAL CORRECTNESS CHECKS — must PASS before deploy", () => {
  // ================================================================
  // 1) Evidence Gate false-positive matrix
  // ================================================================
  describe("Evidence Gate: decimal/comma false positives must return false", () => {
    it("'74' must NOT match inside '$74.00 /carton'", () => {
      const out = isNumericValueGroundedInSource(
        "74",
        "FX-401 Coach screws 3 carton $74.00 /carton"
      );
      if (out) throw new Error("FAIL: '74' matched '$74.00 /carton'");
      expect(out).toBe(false);
    });

    it("'190' must NOT match inside '$190.50'", () => {
      const out = isNumericValueGroundedInSource("190", "GST (15%): $190.50");
      if (out) throw new Error("FAIL: '190' matched '$190.50'");
      expect(out).toBe(false);
    });

    it("'15' must NOT match inside '(15%)'", () => {
      const out = isNumericValueGroundedInSource("15", "GST (15%): $190.50");
      if (out) throw new Error("FAIL: '15' matched '(15%)'");
      expect(out).toBe(false);
    });

    it("'1' must NOT match inside '$1,248.00'", () => {
      const out = isNumericValueGroundedInSource(
        "1",
        "FX-201 Nail gun 24 box $52.00 $1,248.00"
      );
      if (out) throw new Error("FAIL: '1' matched '$1,248.00'");
      expect(out).toBe(false);
    });

    it("'248' must NOT match inside '$1,248.00'", () => {
      const out = isNumericValueGroundedInSource(
        "248",
        "FX-201 Nail gun 24 box $52.00 $1,248.00"
      );
      if (out) throw new Error("FAIL: '248' matched '$1,248.00'");
      expect(out).toBe(false);
    });
  });

  describe("Evidence Gate: authentic standalone numbers must return true", () => {
    it("'3' matches '3 carton'", () => {
      expect(
        isNumericValueGroundedInSource(
          "3",
          "FX-401 Coach screws 3 carton $74.00 /carton"
        )
      ).toBe(true);
    });

    it("'$74.00' matches '$74.00 /carton'", () => {
      expect(
        isNumericValueGroundedInSource(
          "$74.00",
          "FX-401 Coach screws 3 carton $74.00 /carton"
        )
      ).toBe(true);
    });

    it("'$1,248.00' matches '$1,248.00'", () => {
      expect(
        isNumericValueGroundedInSource(
          "$1,248.00",
          "FX-201 Nail gun 24 box $52.00 $1,248.00"
        )
      ).toBe(true);
    });
  });

  // ================================================================
  // 2) IB-56150 derived-number leak check
  // ================================================================
  describe("IB-56150: derived numbers MUST NOT leak to public output", () => {
    it("serialized API JSON contains NO '$1,460.50' or '$41.30' or '1460.50' or '41.30'", async () => {
      const buffer = fs.readFileSync(path.join(FIXTURES, "IB-56150.pdf"));
      const file = new File([new Uint8Array(buffer)], "IB-56150.pdf", {
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
      const serialized = JSON.stringify(json.data);

      const forbidden = ["$1,460.50", "$41.30", "1,460.50", "41.30", "1460.50"];
      for (const needle of forbidden) {
        if (serialized.includes(needle)) {
          throw new Error(
            `FAIL: derived number '${needle}' leaked into IB-56150 API JSON`
          );
        }
      }
      expect(serialized).not.toContain("1,460.50");
      expect(serialized).not.toContain("41.30");
    });

    it("refusal.message itself contains NO '$1,460.50' or '$41.30'", async () => {
      const buffer = fs.readFileSync(path.join(FIXTURES, "IB-56150.pdf"));
      const file = new File([new Uint8Array(buffer)], "IB-56150.pdf", {
        type: "application/pdf",
      });
      const formData = new FormData();
      formData.append("file", file);
      const req = new NextRequest("http://localhost:3000/api/extract", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      const json = (await res.json()) as ApiSuccessResponse;
      const totalRefusal = json.data.refusals.find((r) => r.field === "total");
      expect(totalRefusal).toBeDefined();
      const message = totalRefusal!.message;
      expect(message).not.toContain("1,460.50");
      expect(message).not.toContain("41.30");
    });

    it("refusal.evidence[] contains ONLY the three sourced source lines", async () => {
      const buffer = fs.readFileSync(path.join(FIXTURES, "IB-56150.pdf"));
      const file = new File([new Uint8Array(buffer)], "IB-56150.pdf", {
        type: "application/pdf",
      });
      const formData = new FormData();
      formData.append("file", file);
      const req = new NextRequest("http://localhost:3000/api/extract", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      const json = (await res.json()) as ApiSuccessResponse;
      const totalRefusal = json.data.refusals.find((r) => r.field === "total");
      expect(totalRefusal).toBeDefined();
      const sources = (totalRefusal!.evidence ?? []).map((e) => e.sourceText);
      expect(sources.some((s) => s.includes("$1,270.00"))).toBe(true);
      expect(sources.some((s) => s.includes("$190.50"))).toBe(true);
      expect(sources.some((s) => s.includes("$1,501.80"))).toBe(true);
      // No derived number in any evidence quote
      for (const s of sources) {
        expect(s).not.toContain("1,460.50");
        expect(s).not.toContain("41.30");
      }
    });
  });
});