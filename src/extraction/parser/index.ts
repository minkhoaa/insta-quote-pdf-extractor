import {
  type ExtractionResult,
  type PageExtractionResult,
  createExtractionResult,
} from "@/domain/extraction-result";
import { type LineItem } from "@/domain/line-item";
import {
  type Refusal,
  createPageExtractionFailedRefusal,
} from "@/domain/refusal";
import { type DocumentExtractionPipelineResult } from "../pipeline";
import { parsePageLineItems } from "./table-parser";
import { detectPageContradictions } from "./contradiction-engine";

export * from "./table-parser";
export * from "./contradiction-engine";

/**
 * Parses all pages from a completed PDF pipeline run into the domain ExtractionResult.
 *
 * Invariants:
 * 1. Strict conservative parsing — never derives missing document numbers.
 * 2. Arithmetic is used strictly as a consistency check, never to manufacture values.
 * 3. Contradictions are captured as first-class domain Refusal objects.
 * 4. Page failure isolation is preserved in the domain model.
 */
export function parseExtractedDocument(
  pipelineResult: DocumentExtractionPipelineResult
): ExtractionResult {
  const allItems: LineItem[] = [];
  const allRefusals: Refusal[] = [];
  const pagesResults: PageExtractionResult[] = [];

  let successfullyExtractedPages = 0;
  let failedPages = 0;

  for (const page of pipelineResult.pages) {
    if (!page.usable && page.error) {
      // Page failed during rasterization or OCR
      failedPages++;
      const failureRefusal = createPageExtractionFailedRefusal({
        page: page.page,
        reason: page.error,
      });

      allRefusals.push(failureRefusal);
      pagesResults.push({
        page: page.page,
        status: "failed",
        items: [],
        refusals: [failureRefusal],
        methodUsed: page.method,
        rawText: page.text,
        error: page.error,
      });
      continue;
    }

    // Parse line items from page text
    const { items: pageItems, refusals: pageItemRefusals } =
      parsePageLineItems(page);

    // Run contradiction engine on page text
    const pageContradictions = detectPageContradictions(page);

    const combinedPageRefusals = [
      ...pageItemRefusals,
      ...pageContradictions,
    ];

    allItems.push(...pageItems);
    allRefusals.push(...combinedPageRefusals);
    successfullyExtractedPages++;

    pagesResults.push({
      page: page.page,
      status: combinedPageRefusals.length > 0 ? "partial_success" : "success",
      items: pageItems,
      refusals: combinedPageRefusals,
      methodUsed: page.method,
      rawText: page.text,
    });
  }

  // Determine overall document extraction status
  let documentStatus: "success" | "partial_success" | "refused" = "success";

  if (failedPages > 0) {
    documentStatus = allItems.length > 0 ? "partial_success" : "refused";
  } else if (allRefusals.length > 0) {
    documentStatus = "partial_success";
  } else if (allItems.length === 0) {
    documentStatus = "refused";
  }

  return createExtractionResult({
    status: documentStatus,
    items: allItems,
    refusals: allRefusals,
    pages: pagesResults,
    summary: {
      totalPages: pipelineResult.totalPages,
      extractedPages: successfullyExtractedPages,
      failedPages,
      totalItems: allItems.length,
      totalRefusals: allRefusals.length,
    },
  });
}
