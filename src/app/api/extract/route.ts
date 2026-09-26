import { NextRequest, NextResponse } from "next/server";
import {
  ApiErrorCode,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  MAX_FILE_SIZE_BYTES,
} from "@/domain/api-contracts";
import {
  extractDocumentPages,
  InvalidPdfDocumentError,
} from "@/extraction/pipeline";
import { parseExtractedDocument } from "@/extraction/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Validates whether the buffer begins with the standard PDF magic header (%PDF-).
 */
function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 5) {
    return false;
  }
  return buffer.slice(0, 5).toString("utf-8").startsWith("%PDF-");
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiSuccessResponse | ApiErrorResponse>> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.MISSING_FILE,
          message:
            "Invalid multipart form payload. Expected 'multipart/form-data' with a 'file' field.",
        },
      },
      { status: 400 }
    );
  }

  // 1. Validate file field existence
  const fileEntries = formData.getAll("file");

  if (fileEntries.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.MISSING_FILE,
          message:
            "No file uploaded. Please attach a PDF document using the 'file' field.",
        },
      },
      { status: 400 }
    );
  }

  // 2. Reject multiple simultaneous file uploads
  if (fileEntries.length > 1) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.MULTIPLE_FILES_NOT_ALLOWED,
          message:
            "Only single document extraction is supported per request. Please upload exactly one PDF file.",
        },
      },
      { status: 400 }
    );
  }

  const fileCandidate = fileEntries[0];
  if (!(fileCandidate instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.MISSING_FILE,
          message:
            "The uploaded entry is not a valid file.",
        },
      },
      { status: 400 }
    );
  }

  // 3. Validate non-empty file
  if (fileCandidate.size === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.EMPTY_FILE,
          message: "The uploaded file is empty (0 bytes).",
        },
      },
      { status: 400 }
    );
  }

  // 4. Validate file size (Vercel serverless function ceiling mitigation)
  if (fileCandidate.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (fileCandidate.size / (1024 * 1024)).toFixed(2);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.FILE_TOO_LARGE,
          message: `The uploaded PDF exceeds the 4MB limit for serverless processing (received ${sizeMb} MB). Please upload a smaller file.`,
        },
      },
      { status: 413 }
    );
  }

  // 5. Read buffer and validate PDF signature / magic bytes
  const arrayBuffer = await fileCandidate.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!hasPdfMagicBytes(buffer)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
          message:
            "The uploaded file is not a valid PDF document. Documents must begin with the standard PDF header (%PDF-).",
        },
      },
      { status: 415 }
    );
  }

  // 6. Execute extraction pipeline and deterministic parser
  try {
    const pipelineResult = await extractDocumentPages(buffer);
    const extractionResult = parseExtractedDocument(pipelineResult);

    // Invariant: Domain refusals are successful HTTP 200 extraction responses
    return NextResponse.json(
      {
        ok: true,
        data: extractionResult,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Detect encrypted / password-protected PDF
    if (
      errorMessage.toLowerCase().includes("password") ||
      errorMessage.toLowerCase().includes("encrypted")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: ApiErrorCode.ENCRYPTED_PDF_UNSUPPORTED,
            message:
              "The PDF document is password-protected or encrypted. Please provide an unencrypted document.",
          },
        },
        { status: 422 }
      );
    }

    // Detect corrupt or unreadable PDF
    if (err instanceof InvalidPdfDocumentError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: ApiErrorCode.CORRUPT_PDF_FILE,
            message: `The PDF document could not be read or is corrupted: ${err.message}`,
          },
        },
        { status: 422 }
      );
    }

    // Observability: Log unexpected errors server-side
    console.error("[POST /api/extract] Unhandled extraction error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ApiErrorCode.INTERNAL_SERVER_ERROR,
          message:
            "An unexpected internal error occurred during PDF extraction. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
