import "server-only";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Text item structure returned by PDF.js getTextContent
 */
interface PdfTextItem {
  str: string;
  dir?: string;
  width?: number;
  height?: number;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
  fontName?: string;
  hasEOL?: boolean;
}

/**
 * Result of native extraction for a single page.
 */
export interface NativePageExtraction {
  page: number;
  text: string;
  method: "native";
  usable: boolean;
  requiresOcr: boolean;
  itemCount: number;
  wordCount: number;
  characterCount: number;
  error?: string;
}

/**
 * Result of document-level native extraction.
 */
export interface NativePdfExtractionResult {
  totalPages: number;
  usablePages: number;
  ocrRequiredPages: number;
  pages: NativePageExtraction[];
}

/**
 * Custom error thrown when a PDF document cannot be parsed or opened at all.
 */
export class InvalidPdfDocumentError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "InvalidPdfDocumentError";
    this.cause = cause;
  }
}

/**
 * Conservative thresholds to distinguish genuine native text pages
 * from image-only, scanned, or nearly blank pages.
 */
export const USABILITY_THRESHOLDS = {
  MIN_NON_WHITESPACE_CHARS: 30,
  MIN_MEANINGFUL_WORDS: 5,
  MIN_TEXT_ITEMS: 3,
} as const;

/**
 * Evaluates whether extracted native text represents a usable text page
 * or an image-only / scanned page requiring OCR fallback.
 */
export function evaluatePageUsability(
  text: string,
  itemCount: number
): {
  usable: boolean;
  requiresOcr: boolean;
  characterCount: number;
  wordCount: number;
} {
  const nonWhitespaceChars = text.replace(/\s+/g, "").length;
  // Match alphanumeric words (excluding bare punctuation)
  const words = text.match(/\b[A-Za-z0-9_.-]{2,}\b/g) || [];
  const wordCount = words.length;

  const isUsable =
    nonWhitespaceChars >= USABILITY_THRESHOLDS.MIN_NON_WHITESPACE_CHARS &&
    wordCount >= USABILITY_THRESHOLDS.MIN_MEANINGFUL_WORDS &&
    itemCount >= USABILITY_THRESHOLDS.MIN_TEXT_ITEMS;

  return {
    usable: isUsable,
    requiresOcr: !isUsable,
    characterCount: nonWhitespaceChars,
    wordCount,
  };
}

/**
 * Assembles raw PDF text items into line-ordered text preserving layout fidelity.
 * Does not alter, normalize, or calculate any values.
 */
function assemblePageText(items: PdfTextItem[]): string {
  if (items.length === 0) {
    return "";
  }

  // Filter out completely empty items without EOL
  const meaningfulItems = items.filter(
    (item) => item.str.length > 0 || item.hasEOL
  );

  if (meaningfulItems.length === 0) {
    return "";
  }

  // Group items into lines based on their vertical Y coordinate
  const lines: string[] = [];
  let currentLineParts: string[] = [];
  let currentY: number | null = null;
  let lastX = 0;
  let lastWidth = 0;

  for (const item of meaningfulItems) {
    const y = item.transform[5];
    const x = item.transform[4];
    const width = item.width || 0;

    const isNewLine =
      currentY !== null &&
      (Math.abs(y - currentY) > 3 || (currentLineParts.length > 0 && item.hasEOL));

    if (isNewLine) {
      if (currentLineParts.length > 0) {
        lines.push(currentLineParts.join("").trimEnd());
        currentLineParts = [];
      }
      currentY = y;
      lastX = x;
      lastWidth = width;
    } else if (currentY === null) {
      currentY = y;
      lastX = x;
      lastWidth = width;
    }

    if (item.str.length > 0) {
      // Add a space between items on the same line if there is a horizontal gap
      if (
        currentLineParts.length > 0 &&
        x > lastX + lastWidth + 2 &&
        !currentLineParts[currentLineParts.length - 1].endsWith(" ") &&
        !item.str.startsWith(" ")
      ) {
        currentLineParts.push(" ");
      }

      currentLineParts.push(item.str);
      lastX = x;
      lastWidth = width;
    }

    if (item.hasEOL && currentLineParts.length > 0) {
      lines.push(currentLineParts.join("").trimEnd());
      currentLineParts = [];
      currentY = null;
    }
  }

  if (currentLineParts.length > 0) {
    lines.push(currentLineParts.join("").trimEnd());
  }

  return lines.join("\n").trim();
}

/**
 * Extracts native text from a PDF buffer page by page.
 *
 * Invariants:
 * 1. Page boundaries are strictly preserved.
 * 2. Raw text fidelity is maintained without numeric mutation.
 * 3. Individual page failures are isolated and do not destroy other pages.
 * 4. Image-only pages are identified for OCR fallback rather than falsely claimed as empty.
 */
export async function extractNativePdfPages(
  buffer: Buffer | Uint8Array
): Promise<NativePdfExtractionResult> {
  if (!buffer || buffer.length === 0) {
    throw new InvalidPdfDocumentError("PDF buffer is empty or null.");
  }

  // Validate PDF header (%PDF-)
  const header = Buffer.from(buffer.slice(0, 5)).toString("utf-8");
  if (!header.startsWith("%PDF-")) {
    throw new InvalidPdfDocumentError(
      "Invalid PDF file header: document is not a valid PDF."
    );
  }

  const uint8Data = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  let doc: pdfjs.PDFDocumentProxy;
  try {
    const loadingTask = pdfjs.getDocument({
      data: uint8Data,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    doc = await loadingTask.promise;
  } catch (err) {
    throw new InvalidPdfDocumentError(
      `Failed to open PDF document: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  const totalPages = doc.numPages;
  const pages: NativePageExtraction[] = [];
  let usablePagesCount = 0;
  let ocrRequiredPagesCount = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as PdfTextItem[];
      const assembledText = assemblePageText(items);

      const usability = evaluatePageUsability(assembledText, items.length);

      if (usability.usable) {
        usablePagesCount++;
      } else {
        ocrRequiredPagesCount++;
      }

      pages.push({
        page: pageNum,
        text: assembledText,
        method: "native",
        usable: usability.usable,
        requiresOcr: usability.requiresOcr,
        itemCount: items.length,
        wordCount: usability.wordCount,
        characterCount: usability.characterCount,
      });
    } catch (pageError) {
      // Failure Isolation: one problematic page does not destroy successfully extracted pages
      ocrRequiredPagesCount++;
      pages.push({
        page: pageNum,
        text: "",
        method: "native",
        usable: false,
        requiresOcr: true,
        itemCount: 0,
        wordCount: 0,
        characterCount: 0,
        error:
          pageError instanceof Error ? pageError.message : String(pageError),
      });
    }
  }

  return {
    totalPages,
    usablePages: usablePagesCount,
    ocrRequiredPages: ocrRequiredPagesCount,
    pages,
  };
}
