# InstaQuote AI — Deterministic PDF Line-Item Extractor

A self-contained, full-stack PDF extraction application built with Next.js App Router, TypeScript, and Tailwind CSS. Deployable directly to Vercel without external cloud OCR SaaS, LLM APIs, Python, Docker, Poppler, or system-level dependencies.

---

## Central Invariant

> **NEVER OUTPUT A NUMBER THAT CANNOT BE TRACED TO SOURCE TEXT FROM A SPECIFIC PAGE.**
>
> Refusing is correct. Guessing, silently repairing, calculating missing values, or inventing values is incorrect.

---

## Architecture Overview

```
                      ┌────────────────────────┐
                      │    Uploaded PDF Buffer │
                      └───────────┬────────────┘
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │   Page-by-Page Loop    │
                      └───────────┬────────────┘
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │  Native Text Layer     │
                      │  (PDF.js / pdfjs-dist) │
                      └───────────┬────────────┘
                                  │
                     [Is text layer usable?]
                    /                       \
               YES /                         \ NO (Scanned / image-only)
                  /                           \
                 │                             ▼
                 │                 ┌───────────────────────┐
                 │                 │ Local OCR Fallback    │
                 │                 │ (@napi-rs/canvas      │
                 │                 │  + Tesseract.js with  │
                 │                 │  bundled tessdata)    │
                 │                 └───────────┬───────────┘
                 │                             │
                 └───────────────┬─────────────┘
                                 │
                                 ▼
                      ┌────────────────────────┐
                      │  Deterministic Parser  │
                      │  (Header, Row, Token)  │
                      └───────────┬────────────┘
                                 │
                                 ▼
                      ┌────────────────────────┐
                      │  Contradiction Engine  │
                      │  (Carton & Total check)│
                      └───────────┬────────────┘
                                 │
                                 ▼
                      ┌────────────────────────┐
                      │     Evidence Gate      │
                      │  (Verbatim substring   │
                      │   grounding check)     │
                      └───────────┬────────────┘
                                 │
                                 ▼
                      ┌────────────────────────┐
                      │ Items + Refusals (200) │
                      └────────────────────────┘
```

The application is structured into strict, decoupled layers:

- `src/domain/`: Pure domain contracts, Zod schemas, and invariants (`Evidence`, `LineItem`, `Refusal`, `ExtractionResult`). Zero dependencies on Next.js or Node APIs.
- `src/extraction/pdf/`: Server-only native PDF text extraction with layout-preserving baseline line reconstruction and usability heuristics.
- `src/extraction/ocr/`: Local Tesseract.js worker management using bundled `assets/tessdata/eng.traineddata` and `@napi-rs/canvas` direct image extraction.
- `src/extraction/parser/`: Deterministic row classifier, column tokenizer, and contradiction engine.
- `src/app/api/extract/`: Next.js Route Handler (`multipart/form-data`) running on the Node.js serverless runtime.
- `src/components/`: Accessible, responsive React UI components with evidence inspectors and prominent refusal banners.

---

## How Extraction Works

### 1. Native Text First vs. OCR Fallback
- For every page, the extraction engine first reads the native PDF text layer using `pdfjs-dist`.
- An **evaluator heuristic** analyzes the page: a page is deemed usable if it contains at least 30 non-whitespace characters, 5 alphanumeric words, and 3 text items.
- If native text is sufficient (`IB-55871`, `IB-56010`, `IB-56088`, `IB-56150`, and pages 1–3, 5–8 of `IB-STMT47`), **zero Tesseract workers are spawned**. Extraction completes in milliseconds.
- If a page lacks a usable text layer (`IB-55902` page 1, or `IB-STMT47` page 4), the engine extracts the underlying raster image using `@napi-rs/canvas` and executes local OCR fallback with bundled English trained data.

### 2. Evidence Model
Every accepted numeric business field (`quantity`, `weight`, `unitPrice`, `amount`) is tied to an immutable `Evidence` record:
```typescript
interface Evidence {
  page: number;          // 1-based page number
  sourceText: string;    // Complete verbatim source row string
  method: "native" | "ocr";
  confidence?: number;   // OCR confidence score (0-100) if applicable
}
```
Before any numeric value enters the final output, the **Evidence Gate** verifies that the candidate token exists verbatim in the source row text.

### 3. Refusal Model
Safe domain rejection is treated as first-class domain data, **not** thrown as an unhandled error or HTTP 500. Stable refusal codes include:
- `NOT_PRESENT_IN_SOURCE`: Document field was omitted from source text.
- `CONTRADICTORY_VALUES`: Conflicting figures detected (retains multiple source quotes as evidence).
- `AMBIGUOUS_VALUE`: Unresolvable ambiguity in values.
- `OCR_LOW_CONFIDENCE`: Text recognition confidence below safety threshold.
- `PAGE_EXTRACTION_FAILED`: Isolated page failure.
- `UNSUPPORTED_DOCUMENT_STRUCTURE`: Non-tabular document structure.

### 4. Why Missing Values Are Not Calculated
In invoice `IB-56010`, the table contains `Qty = 3` and `Unit Price = $74.00`, but lacks an `Amount` column.
- Computing `3 * $74.00 = $222.00` would violate the central invariant: `$222.00` was never stated on the page.
- In trade accounting, calculating missing numbers can introduce phantom claims, mask unbilled items, or misrepresent discounts.
- The engine outputs `amount: undefined` and the UI clearly displays `Not in source`.

### 5. Failure Isolation
- In multi-page document `IB-STMT47`, if Page 4 encounters an OCR timeout or rasterization failure, Page 4 records a `PAGE_EXTRACTION_FAILED` refusal.
- Successfully extracted items from Pages 1–3 and 5–8 (21 items) are completely preserved.
- The document status resolves to `partial_success` (HTTP 200) rather than terminating the entire extraction.

---

## Assessment Questions

### Question 1: What was the hardest decision and why did you choose that approach?

**The hardest decision was strictly committing to "refuse over repair" when arithmetic contradictions occurred.**

When extracting `IB-56150`, the printed figures state:
- Subtotal: `$1,270.00`
- GST (15%): `$190.50`
- Printed Total: `$1,501.80`

Arithmetic calculation (`1,270.00 + 190.50 = $1,460.50`) clearly shows that the printed total is incorrect by `$41.30`. Many OCR/extraction products silently "fix" the total to `$1,460.50` or override the tax. 

We chose to strictly refuse to alter the number. The engine outputs the verbatim line items and surfaces an explicit `CONTRADICTORY_VALUES` refusal alerting the user to the `$41.30` discrepancy with all three printed quotes. A software tool auditing financial or trade documents must never forge or alter numbers; a refusal allows human accountants to resolve disputes with the supplier, whereas silent repair conceals errors.

### Question 2: Where are you not confident?

1. **Unconventional & Multi-Column Table Layouts:** The deterministic row tokenizer is designed around horizontal line items with standard delimiter sequences. While it reliably parses trade invoices matching standard conventions, it would refuse or miss items on documents with vertically rotated tables, multi-page wrapped line-item tables with column headers repeated arbitrarily, or unstructured freeform text receipts.
2. **Degraded & Skewed Real-World Scans:** Our local OCR engine operates on `tessdata_fast` English models. Clean scans (`IB-55902`) achieve 92% confidence. However, camera photos taken on job sites with severe perspective distortion, uneven lighting, shadows, or heavy paper folds will degrade Tesseract's character recognition without image preprocessing.
3. **Serverless Concurrency on Large Multi-Page Scans:** While native pages extract in <50ms, Tesseract.js running in single-threaded WebAssembly consumes ~1.2s of CPU per page. A 10-page document composed entirely of image scans would take ~12s, which risks hitting Vercel's standard 10–15s function execution limit.

### Question 3: What would you do with three more days?

1. **Bounding-Box Spatial Coordinates & Visual Evidence Overlay:**
   Record normalized `[x, y, width, height]` coordinates for every character and token extracted. In the UI, render the PDF page side-by-side with the table so clicking any number highlights the exact bounding box rectangle directly on the PDF canvas.
2. **Adaptive Layout Segmentation via Spatial Clustering:**
   Replace regex line tokenization with DBSCAN spatial clustering on PDF text item coordinates. This would dynamically identify table column boundaries based on vertical alignment rather than token spacing heuristics.
3. **Image Preprocessing Pipeline for OCR:**
   Implement a lightweight preprocessing step on rendered canvas images before passing them to Tesseract (grayscale conversion, Otsu thresholding for adaptive binarization, and deskewing). This would dramatically improve OCR accuracy on noisy mobile phone scans.
4. **Asynchronous Background Processing for Large Scans:**
   For multi-page scanned documents exceeding 4MB or 5 pages, implement an asynchronous processing pipeline: upload directly to S3/R2 presigned URLs, enqueue background worker extraction, and stream real-time progress to the UI via Server-Sent Events (SSE).

---

## Local Development

### Prerequisites
- Node.js `20.16+` (or Node `24.x`)
- npm `10+`

No system dependencies (no Python, no Poppler, no Docker, no system Tesseract) are required.

### Setup
```bash
# 1. Clone repository
git clone <repo-url>
cd insta-quote-ai-assessment

# 2. Install dependencies cleanly
npm ci

# 3. Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Commands

```bash
# Run ESLint checks
npm run lint

# Run TypeScript strict type-checking
npm run typecheck

# Run all Vitest unit and integration tests (71 tests across 13 test suites)
npm run test

# Build production bundle
npm run build
```

---

## Verification Matrix (Six Assessment PDFs)

| Filename | Total Pages | Native Pages | OCR Pages | Extracted Items | Refusals | Notable Behavior |
|---|---|---|---|---|---|---|
| `IB-55871.pdf` | 1 | 1 | 0 | **4 items** | **0** | Clean tabular invoice with full native evidence for quantity, unit, price, and amount. |
| `IB-55902.pdf` | 1 | 0 | 1 | **3 items** | **0** | Scanned image-only PDF; automatically falls back to local Tesseract OCR (method="ocr", confidence 92%). |
| `IB-56010.pdf` | 1 | 1 | 0 | **4 items** | **0** | Weight table with **no Amount column**; amount is strictly `undefined` (never calculated as 3 × $74 = $222.00); weights preserved raw (`20kg`, `640g total`, `1.4kg`, `500g`). |
| `IB-56088.pdf` | 1 | 1 | 0 | **3 items** | **1 refusal** | 3 valid items extracted; generates `CONTRADICTORY_VALUES` refusal for 9 vs 11 carton count contradiction with both source quotes. |
| `IB-56150.pdf` | 1 | 1 | 0 | **4 items** | **1 refusal** | 4 valid items extracted; generates `CONTRADICTORY_VALUES` refusal for printed total conflict ($1,501.80 vs subtotal + GST $1,460.50). |
| `IB-STMT47.pdf` | 8 | 7 | 1 | **24 items** | **0** | 8-page statement; Page 4 extracted via OCR, Pages 1–3 and 5–8 remain native. Failure on Page 4 preserves remaining 21 items. |

---

## Vercel Deployment

This repository is ready for one-click deployment to Vercel without requiring any external services, environment secrets, or add-ons:

1. Push this repository to GitHub / GitLab.
2. In the Vercel dashboard, click **"Add New Project"** and import the repository.
3. Keep default settings:
   - Framework Preset: **Next.js**
   - Root Directory: `./`
   - Build Command: `next build`
   - Output Directory: `.next`
4. **Environment Variables:** None required. All extraction and OCR assets are bundled locally.
5. Click **"Deploy"**.

### Serverless Compatibility Features
- `export const runtime = "nodejs"` on Route Handler `/api/extract`.
- Native bindings (`@napi-rs/canvas`, `pdfjs-dist`, `tesseract.js`) configured in `next.config.ts` (`serverExternalPackages`).
- Tesseract trained data asset (`assets/tessdata/eng.traineddata`) traced into serverless output via `outputFileTracingIncludes`.
- Writable serverless cache configured in `/tmp/tessdata-cache`.
- Upload size limit capped at 4MB to strictly respect Vercel function body limits.
