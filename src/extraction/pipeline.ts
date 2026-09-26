import "server-only";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  extractNativePdfPages,
  InvalidPdfDocumentError,
} from "./pdf/native-extractor";
import { renderPdfPageToImage } from "./ocr/page-renderer";
import {
  createLocalOcrWorker,
  performOcrOnImageBuffer,
  type OcrWorker,
} from "./ocr/ocr-extractor";

/**
 * Result of extracting a single page through the complete pipeline.
 */
export interface ExtractedPage {
  page: number;
  text: string;
  method: "native" | "ocr";
  usable: boolean;
  confidence?: number;
  wordCount: number;
  characterCount: number;
  error?: string;
}

/**
 * Overall document extraction pipeline result.
 */
export interface DocumentExtractionPipelineResult {
  totalPages: number;
  nativePagesCount: number;
  ocrPagesCount: number;
  failedPagesCount: number;
  pages: ExtractedPage[];
}

export { InvalidPdfDocumentError };

/**
 * Orchestrates the full PDF extraction pipeline:
 *
 * 1. Native text extraction first (page-by-page).
 * 2. OCR fallback ONLY for pages where native text is unusable / image-only.
 * 3. Worker lifecycle: 0 workers created if all pages are native;
 *    Reuses 1 worker across all OCR-required pages; always terminates safely in finally.
 * 4. Failure isolation: error on one page never destroys other page results.
 */
export async function extractDocumentPages(
  buffer: Buffer | Uint8Array
): Promise<DocumentExtractionPipelineResult> {
  // Ensure independent buffer copy for native extraction
  const nativeBuffer = Buffer.from(buffer);
  const nativeResult = await extractNativePdfPages(nativeBuffer);

  // Check if any pages need OCR fallback
  const pagesNeedingOcr = nativeResult.pages.filter((p) => p.requiresOcr);

  // If no pages need OCR, return native results immediately without worker initialization
  if (pagesNeedingOcr.length === 0) {
    const pages: ExtractedPage[] = nativeResult.pages.map((p) => ({
      page: p.page,
      text: p.text,
      method: "native",
      usable: p.usable,
      wordCount: p.wordCount,
      characterCount: p.characterCount,
      error: p.error,
    }));

    return {
      totalPages: nativeResult.totalPages,
      nativePagesCount: nativeResult.usablePages,
      ocrPagesCount: 0,
      failedPagesCount: nativeResult.pages.filter((p) => !p.usable && p.error).length,
      pages,
    };
  }

  // 2. Open PDF document for rendering OCR-required pages with fresh independent buffer copy
  const ocrData = new Uint8Array(Buffer.from(buffer));
  const doc = await pdfjs.getDocument({
    data: ocrData,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  // Initialize a single worker for all OCR tasks in this extraction job
  let worker: OcrWorker | null = null;
  const resultMap = new Map<number, ExtractedPage>();

  // Initialize resultMap with native results
  for (const p of nativeResult.pages) {
    if (!p.requiresOcr) {
      resultMap.set(p.page, {
        page: p.page,
        text: p.text,
        method: "native",
        usable: true,
        wordCount: p.wordCount,
        characterCount: p.characterCount,
      });
    }
  }

  try {
    worker = await createLocalOcrWorker();

    for (const pageItem of pagesNeedingOcr) {
      try {
        const pageProxy = await doc.getPage(pageItem.page);
        const imageBuffer = await renderPdfPageToImage(pageProxy);
        const ocrResult = await performOcrOnImageBuffer(imageBuffer, worker);

        const nonWhitespaceChars = ocrResult.text.replace(/\s+/g, "").length;
        const words = ocrResult.text.match(/\b[A-Za-z0-9_.-]{2,}\b/g) || [];

        resultMap.set(pageItem.page, {
          page: pageItem.page,
          text: ocrResult.text,
          method: "ocr",
          usable: ocrResult.confidence >= 50 && nonWhitespaceChars > 20,
          confidence: ocrResult.confidence,
          wordCount: words.length,
          characterCount: nonWhitespaceChars,
        });
      } catch (ocrErr) {
        // Page-level failure isolation: capture error, do not fail entire document
        resultMap.set(pageItem.page, {
          page: pageItem.page,
          text: "",
          method: "ocr",
          usable: false,
          wordCount: 0,
          characterCount: 0,
          error:
            ocrErr instanceof Error ? ocrErr.message : String(ocrErr),
        });
      }
    }
  } finally {
    // Invariant: Always safely terminate worker
    if (worker) {
      await worker.terminate();
    }
  }

  // Assemble final ordered pages list
  const pages: ExtractedPage[] = [];
  let nativeCount = 0;
  let ocrCount = 0;
  let failedCount = 0;

  for (let i = 1; i <= nativeResult.totalPages; i++) {
    const pageData = resultMap.get(i) || {
      page: i,
      text: "",
      method: "native" as const,
      usable: false,
      wordCount: 0,
      characterCount: 0,
      error: "Page data missing from extraction map",
    };

    if (pageData.method === "native" && pageData.usable) {
      nativeCount++;
    } else if (pageData.method === "ocr" && pageData.usable) {
      ocrCount++;
    } else {
      failedCount++;
    }

    pages.push(pageData);
  }

  return {
    totalPages: nativeResult.totalPages,
    nativePagesCount: nativeCount,
    ocrPagesCount: ocrCount,
    failedPagesCount: failedCount,
    pages,
  };
}
