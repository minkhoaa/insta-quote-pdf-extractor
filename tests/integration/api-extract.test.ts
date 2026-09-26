import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/extract/route";
import { ApiErrorCode, MAX_FILE_SIZE_BYTES } from "@/domain/api-contracts";
import { RefusalCode } from "@/domain/refusal";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/pdfs");

function createMockPdfFile(filename: string): File {
  const filePath = path.join(FIXTURES_DIR, filename);
  const buffer = fs.readFileSync(filePath);
  return new File([buffer], filename, { type: "application/pdf" });
}

describe("POST /api/extract Route Handler", () => {
  // Test 1: Valid PDF Upload
  it("extracts items and returns HTTP 200 for a valid PDF (IB-55871)", async () => {
    const file = createMockPdfFile("IB-55871.pdf");
    const formData = new FormData();
    formData.append("file", file);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.items).toHaveLength(4);
    expect(body.data.refusals).toHaveLength(0);
    expect(body.data.status).toBe("success");
  });

  // Test 2: Extraction containing domain refusals returns HTTP 200 (NOT 500)
  it("returns HTTP 200 with items AND refusals when domain contradictions exist (IB-56088)", async () => {
    const file = createMockPdfFile("IB-56088.pdf");
    const formData = new FormData();
    formData.append("file", file);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    // CRITICAL REQUIREMENT: Must be 200, never a generic error
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.items).toHaveLength(3);
    expect(body.data.refusals).toHaveLength(1);
    expect(body.data.refusals[0].reasonCode).toBe(RefusalCode.CONTRADICTORY_VALUES);
    expect(body.data.refusals[0].field).toBe("cartonCount");
    expect(body.data.refusals[0].message).toContain("Conflicting carton counts");
  });

  // Test 3: Total contradiction document returns HTTP 200 with domain refusal
  it("returns HTTP 200 with total arithmetic contradiction refusal (IB-56150)", async () => {
    const file = createMockPdfFile("IB-56150.pdf");
    const formData = new FormData();
    formData.append("file", file);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.items).toHaveLength(4);
    expect(body.data.refusals).toHaveLength(1);
    expect(body.data.refusals[0].field).toBe("total");
  });

  // Test 4: Missing File
  it("returns HTTP 400 when no file is uploaded in FormData", async () => {
    const formData = new FormData(); // empty

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ApiErrorCode.MISSING_FILE);
    expect(body.error.message).toContain("No file uploaded");
  });

  // Test 5: Multiple Files Upload
  it("returns HTTP 400 when multiple files are attached", async () => {
    const file1 = createMockPdfFile("IB-55871.pdf");
    const file2 = createMockPdfFile("IB-56010.pdf");
    const formData = new FormData();
    formData.append("file", file1);
    formData.append("file", file2);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ApiErrorCode.MULTIPLE_FILES_NOT_ALLOWED);
  });

  // Test 6: Empty File (0 bytes)
  it("returns HTTP 400 when an empty file (0 bytes) is uploaded", async () => {
    const emptyFile = new File([], "empty.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", emptyFile);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ApiErrorCode.EMPTY_FILE);
  });

  // Test 7: Oversized File (> 4MB)
  it("returns HTTP 413 when file exceeds the 4MB limit", async () => {
    // Construct fake oversized file (4.5 MB)
    const largeBuffer = new Uint8Array(MAX_FILE_SIZE_BYTES + 1024);
    const oversizedFile = new File([largeBuffer], "large.pdf", {
      type: "application/pdf",
    });
    const formData = new FormData();
    formData.append("file", oversizedFile);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(413);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ApiErrorCode.FILE_TOO_LARGE);
    expect(body.error.message).toContain("exceeds the 4MB limit");
  });

  // Test 8: Non-PDF Upload (Invalid MIME / Magic Bytes)
  it("returns HTTP 415 when uploaded file does not begin with %PDF- header", async () => {
    const textFile = new File(
      ["Hello, this is a plain text file pretending to be a PDF"],
      "fake.pdf",
      { type: "application/pdf" }
    );
    const formData = new FormData();
    formData.append("file", textFile);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(415);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
    expect(body.error.message).toContain("%PDF-");
  });

  // Test 9: Corrupted PDF file
  it("returns HTTP 422 when PDF header is present but binary stream is corrupted", async () => {
    // Starts with %PDF- but followed by broken garbage
    const corruptBuffer = Buffer.from("%PDF-1.4\nCorrupt garbage data that cannot be parsed");
    const corruptFile = new File([corruptBuffer], "corrupt.pdf", {
      type: "application/pdf",
    });
    const formData = new FormData();
    formData.append("file", corruptFile);

    const request = new NextRequest("http://localhost:3000/api/extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ApiErrorCode.CORRUPT_PDF_FILE);
  });
});
