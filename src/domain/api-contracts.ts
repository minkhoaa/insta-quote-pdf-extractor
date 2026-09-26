import { z } from "zod";
import { ExtractionResultSchema, type ExtractionResult } from "./extraction-result";

/**
 * Standard machine-readable API error codes for request-level failures.
 */
export const ApiErrorCode = {
  MISSING_FILE: "MISSING_FILE",
  MULTIPLE_FILES_NOT_ALLOWED: "MULTIPLE_FILES_NOT_ALLOWED",
  EMPTY_FILE: "EMPTY_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  CORRUPT_PDF_FILE: "CORRUPT_PDF_FILE",
  ENCRYPTED_PDF_UNSUPPORTED: "ENCRYPTED_PDF_UNSUPPORTED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export const ApiErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorPayload = z.infer<typeof ApiErrorPayloadSchema>;

export const ApiSuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: ExtractionResultSchema,
});
export type ApiSuccessResponse = {
  ok: true;
  data: ExtractionResult;
};

export const ApiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorPayloadSchema,
});
export type ApiErrorResponse = {
  ok: false;
  error: ApiErrorPayload;
};

export type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB Vercel Serverless limit
