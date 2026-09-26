# InstaQuote AI - PDF Extraction Architecture (Phase 0)

## 1. Executive Summary & Goals

The goal of this application is to deliver a reliable, self-contained, full-stack PDF line-item extraction service deployable to Vercel without external cloud OCR APIs, LLMs, or system-level dependencies (no Python, no system Poppler, no system Tesseract, no Docker, no external database).

### Central Invariant
**NEVER OUTPUT A NUMBER THAT CANNOT BE TRACED TO SOURCE TEXT FROM A SPECIFIC PAGE.**
- Refusing is a valid, correct domain outcome.
- Guessing, interpolating, calculating missing numbers (e.g. computing `amount = quantity * unitPrice`), or inventing values is strictly forbidden.
- Any numeric value without exact source-text evidence on its originating page is refused.

---

## 2. Distinction: Request Failure vs. Extraction Refusal

To maintain clean separation between HTTP transport and extraction domain logic:

| Dimension | Request Failure (HTTP 4xx / 5xx) | Extraction Refusal (HTTP 200 with Refusals) |
|---|---|---|
| **Cause** | Malformed HTTP request, missing file, non-PDF MIME type, corrupted binary that cannot open, payload > size limit. | Valid PDF document containing unparseable tables, blurry scans, low OCR confidence, missing columns, or unverifiable numbers. |
| **Status Code** | `400 Bad Request`, `413 Payload Too Large`, `415 Unsupported Media Type`, `500 Internal Error`. | `200 OK` with structured payload `{ status: "success" \| "partial_success" \| "refused", items: [...], refusals: [...] }`. |
| **Domain Meaning**| The extraction engine could not run or complete its pipeline. | The engine executed successfully and determined that certain fields/items cannot be safely extracted according to strict evidence rules. |

---

## 3. End-to-End Extraction Pipeline

```
┌────────────────────────────────────────────────────────┐
│                      PDF Upload                        │
│             (multipart/form-data POST)                 │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                Page-by-Page Extraction                 │
│              (Isolated per-page loop)                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                1. Native Text First                    │
│    (pdf-parse / PDF.js extracts text layer + bboxes)   │
└───────────────────────────┬────────────────────────────┘
                            │
               [Is text layer sufficient?]
              /                           \
         YES /                             \ NO (Scanned / empty)
            /                               \
           │                                 ▼
           │                     ┌───────────────────────┐
           │                     │   2. OCR Fallback     │
           │                     │  (@napi-rs/canvas     │
           │                     │   + Tesseract.js with │
           │                     │   local tessdata)     │
           │                     └───────────┬───────────┘
           │                                 │
           └────────────────┬────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                       3. Parser                        │
│   (Row segmentation, column alignment, token matching) │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                     4. Validation                      │
│     (Zod schemas, structural bounds, format checks)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   5. Evidence Gate                     │
│  (Strict substring verification against page source;   │
│   Refuse any number lacking verbatim page trace)       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Items + Refusals                     │
│  (Structured JSON: validated items, granular refusals, │
│   per-page audit log)                                  │
└────────────────────────────────────────────────────────┘
```

### Page Failure Isolation
- Processing occurs sequentially page-by-page.
- If page $N$ encounters an unrecoverable rendering or OCR error, page $N$ is marked with an extraction refusal/failure in `pages[N]`.
- Previously extracted pages ($1 \dots N-1$) and subsequent pages ($N+1 \dots M$) are preserved.
- The document status resolves to `partial_success`, ensuring partial value is never lost due to a single bad page.

---

## 4. Conservative Extraction & Evidence Gate

1. **Evidence Structure**:
   ```typescript
   export interface NumericEvidence {
     pageNumber: number;
     sourceText: string;      // Verbatim string matching source text
     method: "native" | "ocr";
     confidence?: number;     // OCR confidence score (0-100) if applicable
   }

   export interface ExtractedNumericField {
     value: number;           // Parsed numeric value (e.g., 74.00)
     rawText: string;         // Verbatim raw token (e.g., "$74.00")
     evidence: NumericEvidence;
   }
   ```

2. **No Derived Numbers**:
   - If a table has `quantity = 3` and `unitPrice = 74.00`, but `amount` is blank or unreadable, `amount` is NOT calculated as `222.00`. It is reported as missing or emitted as a field refusal.
   - Totals and sub-totals are only extracted if explicitly present with their own verifiable evidence in the source text.

3. **No Unwarranted Normalization**:
   - Units (`kg`, `pcs`, `hrs`) and currencies (`$`, `EUR`, `VND`) are kept as stated in source without silent unit conversions.

---

## 5. Proposed Folder Structure

```
insta-quote-ai-assessment/
├── assets/
│   └── tessdata/
│       └── eng.traineddata             # Bundled local English OCR training data
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── extract/
│   │   │       └── route.ts            # Route handler for PDF upload (multipart/form-data)
│   │   ├── globals.css                 # Tailwind CSS styles
│   │   ├── layout.tsx                  # Root layout
│   │   └── page.tsx                    # Main extraction dashboard UI
│   ├── components/
│   │   ├── upload/
│   │   │   ├── file-dropzone.tsx       # Drag-and-drop PDF uploader
│   │   │   └── upload-progress.tsx
│   │   ├── results/
│   │   │   ├── extraction-summary.tsx  # Document-level stats and badges
│   │   │   ├── line-items-table.tsx    # Table displaying items with evidence tooltips
│   │   │   ├── evidence-modal.tsx      # Inspector showing page number and exact snippet
│   │   │   └── refusal-panel.tsx       # Granular refusal cards with reasons
│   │   └── ui/                         # Base UI primitives (buttons, badges, alerts)
│   ├── domain/
│   │   ├── evidence.ts                 # Evidence interfaces and invariants
│   │   ├── line-item.ts                # Line item domain types
│   │   ├── refusal.ts                  # Refusal codes, reasons, and types
│   │   └── extraction-result.ts        # Page and Document extraction result contracts
│   ├── extraction/
│   │   ├── pdf/
│   │   │   ├── native-extractor.ts     # PDF.js / pdf-parse text layer extraction
│   │   │   └── page-renderer.ts        # @napi-rs/canvas PDF page rasterization
│   │   ├── ocr/
│   │   │   └── ocr-extractor.ts        # Tesseract.js worker with bundled eng.traineddata
│   │   ├── parser/
│   │   │   ├── table-parser.ts         # Heuristic table row/column parser
│   │   │   └── line-matcher.ts         # Token matching and field identification
│   │   ├── validation/
│   │   │   ├── schema.ts               # Zod validation schemas
│   │   │   └── evidence-gate.ts        # Verifies numeric values match page source text
│   │   └── pipeline.ts                 # Orchestrates page loop, fallback, parser, gate
│   ├── lib/
│   │   └── utils.ts                    # General helper utilities
│   └── types/
│       └── index.ts                    # Public type re-exports
├── tests/
│   ├── unit/
│   │   ├── parser.test.ts              # Row parsing logic tests
│   │   ├── evidence-gate.test.ts       # Verifies refusal when numbers lack source match
│   │   └── refusal.test.ts             # Conservative extraction rules tests
│   ├── integration/
│   │   └── pipeline.test.ts            # Native + OCR fallback pipeline tests
│   └── fixtures/
│       └── sample-data.ts              # Synthetic texts and tables for pure testing
├── ARCHITECTURE.md
├── next.config.ts                      # Server external packages configuration
├── package.json
├── tsconfig.json
└── vitest.config.ts                    # Unit test configuration
```

---

## 6. Proposed Dependencies & Justifications

### Runtime Dependencies
1. **`next` & `react` & `react-dom`**: Web framework providing App Router, React Server Components, and Route Handlers.
2. **`zod`**: Schema validation for API payloads, domain invariants, and pipeline outputs.
3. **`pdf-parse` / `pdfjs-dist`**: Native PDF text and metadata extraction (reads embedded text layers and character coordinates). Server-only.
4. **`tesseract.js`**: Pure JavaScript / WebAssembly OCR engine for scanned pages without text layers, eliminating external system binaries. Server-only.
5. **`@napi-rs/canvas`**: High-performance prebuilt native canvas implementation for Node.js, required to rasterize PDF pages for Tesseract OCR fallback. Server-only.
6. **`server-only`**: Build-time guard to ensure extraction engines and canvas modules are never accidentally imported into client bundles.
7. **`lucide-react`**: Clean iconography for extraction statuses, evidence indicators, and warnings.
8. **`clsx` & `tailwind-merge`**: Utility for dynamic Tailwind class management.

### Dev Dependencies
1. **`typescript` & `@types/node` & `@types/react`**: Type safety.
2. **`tailwindcss` & `postcss` & `autoprefixer`**: Styling framework.
3. **`vitest`**: Fast Vite-powered test runner for pure unit testing independent of Next.js runtime.

---

## 7. Server-Only Dependencies Identification

The following dependencies touch Node.js native bindings, filesystem APIs, or large memory allocations and MUST be isolated to the server runtime:
- `pdf-parse` / `pdfjs-dist`
- `@napi-rs/canvas`
- `tesseract.js`
- `fs/promises`, `path`

These modules will be configured in `next.config.ts`:
```typescript
const nextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', 'tesseract.js', 'pdf-parse', 'pdfjs-dist'],
};
```
This prevents webpack/Turbopack from trying to bundle C++ binaries or WebAssembly workers into browser bundles.

---

## 8. Vercel & Serverless Risks and Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Request Body Limit (4.5 MB)** | Serverless functions reject payloads > 4.5 MB with 413 error. | Validate file size on client before upload. Reject files > 4 MB in Route Handler with immediate actionable error. |
| **Function Duration (10s Hobby / 60s Pro)** | Multi-page OCR can exceed timeout limits. | Prioritize native text layer extraction (< 100ms/page). Fall back to OCR only for scanned pages. Cap page count per sync request (e.g. max 5-10 pages) with clear refusal if exceeded. |
| **OCR Memory Usage** | Tesseract.js WASM + canvas bitmaps can exceed 1024MB RAM under concurrency. | Process pages sequentially in loop (no `Promise.all` across pages). Terminate Tesseract worker after batch completion. Render at optimal DPI (150-200 DPI). |
| **Native Module Bundling** | `@napi-rs/canvas` uses native `.node` binaries; bundlers can break paths. | Use `serverExternalPackages` in `next.config.ts` so Vercel includes the proper `@napi-rs/canvas-linux-x64-gnu` binary at runtime. |
| **Read-Only Serverless Filesystem** | Vercel lambda filesystem is read-only except `/tmp`. | Bundle `assets/tessdata/eng.traineddata` in the repo, point Tesseract `langPath` via `path.join(process.cwd(), 'assets/tessdata')` or cache in `/tmp`. |

---

## 9. Phased Roadmap

- **Phase 0 (Current)**: Architecture definition, environment inspection, risk analysis, dependency roadmap.
- **Phase 1**: Core domain models, parser logic, evidence verification gate, refusal schemas, and Vitest unit tests (pure logic decoupled from UI/API).
- **Phase 2**: PDF extraction engines (native PDF.js/pdf-parse text layer extraction, canvas rasterizer, local Tesseract.js OCR fallback), pipeline integration tests.
- **Phase 3**: Next.js Route Handler (`/api/extract`), multipart form-data handling, server-only safety, isolation, error handling.
- **Phase 4**: Frontend UI (Next.js App Router, Tailwind CSS, file uploader, line items table, evidence inspector, refusal viewer).
- **Phase 5**: Vercel deployment configuration, build checks, and end-to-end verification.
