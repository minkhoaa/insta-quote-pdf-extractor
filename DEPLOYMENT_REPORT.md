# Deployment Report

## Status

DEPLOYED

## Quality Checks

| Check | Result |
|---|---|
| npm ci | PASS — clean install, no OS / pip / apt dependencies |
| lint | PASS — `next lint`, zero warnings, zero errors |
| typecheck | PASS — `tsc --noEmit` strict, zero errors |
| tests | PASS — 16 test files, 108 tests, ~9s |
| build | PASS — `next build` succeeds, route `/api/extract` Dynamic |
| local production smoke test | PASS — `next start` on port 3457, all six PDFs return correct results |
| preview smoke test | PASS — initial preview at `…hf1pe8ttl…` confirmed deployment reached the network |
| production smoke test | PASS — `vercel curl` against `…l60by9zdt…`, all four required PDFs verified |

## Deployment

- **Vercel project:** `minkhoaas-projects/insta-quote-pdf-extractor`
- **Project ID:** `prj_1hJdoQ7c5yfyTDysTZ148t5UtsNv`
- **Preview URL:** `https://insta-quote-pdf-extractor-hf1pe8ttl-minkhoaas-projects.vercel.app`
- **Production URL:** `https://insta-quote-pdf-extractor-l60by9zdt-minkhoaas-projects.vercel.app`
- **Runtime:** Node.js (serverless function)
- **External API requirements:** None. No cloud OCR, no LLM, no API key.
- **Bundled assets:** `assets/tessdata/eng.traineddata`, `pdfjs-dist/legacy/build/pdf.worker.mjs`, six `tesseract.js-core/*.wasm` files.

### Deployment fixes applied during this session

Two genuine bundling issues were reproduced against the real Vercel runtime
and resolved with the smallest possible configuration change:

1. `pdfjs-dist/legacy/build/pdf.worker.mjs` was missing from the serverless
   bundle. Symptom: every PDF returned
   `CORRUPT_PDF_FILE` with
   `Cannot find module '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'`.
   Fix: added the file to `outputFileTracingIncludes` in `next.config.ts`.
2. `tesseract.js-core/tesseract-core-relaxedsimd.wasm` (and four sibling
   WASM cores) were missing. Symptom: OCR requests hung past 180 s, then
   surfaced `ENOENT: no such file or directory, open '/var/task/node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm'`
   in `vercel logs`. Fix: added all six `tesseract.js-core/*.wasm` files
   to `outputFileTracingIncludes`.

Both fixes are static configuration; no runtime behavior changed.

## Production PDF Smoke Tests

| PDF | Expected | Actual | Result |
|---|---|---|---|
| IB-55871 | 4 native items | `status=success`, 4 items, methods `native` | PASS |
| IB-55902 | OCR fallback, 3 items | `status=success`, 3 items, methods `ocr` | PASS |
| IB-56088 | 3 items + carton contradiction | `status=partial_success`, 3 items, `reasonCode=CONTRADICTORY_VALUES field=cartonCount` | PASS |
| IB-STMT47 | Mixed native + OCR, page 4 OCR | `status=success`, 24 items, 8 pages, page 4 items have `method=ocr`, other 21 have `method=native` | PASS |

The other two fixtures (IB-56010 and IB-56150) were also exercised end to
end via the local production smoke test and continue to behave correctly.

### Deployment Protection

SSO Deployment Protection was initially enabled (Vercel default). It was
disabled via `vercel project protection disable insta-quote-pdf-extractor --sso`
after the user reported the public URL was inaccessible from an
incognito browser. The public production URL now serves the homepage and
`/api/extract` to any client without authentication.

## Repository Cleanup

**Removed (cleanup only — no behavior change):**

- `pdf-parse` from `next.config.ts serverExternalPackages` (not installed,
  not imported, not in `package-lock.json`)
- `src/extraction/index.ts` and `src/types/index.ts` (unused barrel files;
  no source or test imported them)
- `ARCHITECTURE.md` (superseded by the rewritten README and the actual
  implementation)

**Added during this session:**

- `tests/unit/final-correctness-checks.test.ts` — focused regression
  suite for the Evidence Gate false-positive matrix and the IB-56150
  derived-number leak check
- `DEPLOYMENT_REPORT.md` (this file)
- `FINAL_PREDEPLOY_REPORT.md` (earlier pre-deploy verdict)

**Modified:**

- `next.config.ts` — added `outputFileTracingIncludes` entries for the
  pdfjs worker and tesseract WASM cores (real deployment fix)
- `README.md` — rewritten from scratch in concise Google-style tone

**Verified unchanged:**

- `package.json` — no dependency changes
- `package-lock.json` — `npm ci` reproduces the same lockfile
- `.gitignore` — `.vercel/`, `node_modules/`, `.next/`, and
  `assets/tessdata/eng.traineddata` policy all correct

## Remaining Limitations

1. **OCR confidence is page-level.** `performOcrOnImageBuffer` reads
   `result.data.confidence` (a page-level average) and uses it as the
   usability threshold (`>= 50`). Per-token confidence from
   `result.data.words[]` is exposed by Tesseract.js but not currently used
   to reject individual uncertain numeric tokens.
2. **Single OCR parser per request.** Concurrent OCR-heavy requests
   cannot be parallelized across cores; Tesseract.js runs in single-threaded
   WebAssembly.
3. **Upload size capped at 4 MB** to respect Vercel's request body limit.
4. **No background-task queue.** Large OCR-heavy documents can approach the
   serverless function duration budget on Vercel's Hobby plan.
5. ~~No real-Vercel smoke test for an unauthenticated browser session.~~
   SSO Deployment Protection was disabled after the user requested
   public access; all six PDFs now serve directly from
   `https://insta-quote-pdf-extractor.vercel.app` to anonymous clients.

## GitHub Repository

The full source has been pushed to:

`https://github.com/minkhoaa/insta-quote-pdf-extractor`

Public repository under the `minkhoaa` GitHub account. The commit history
includes the local baseline (commit `9b776ec`) plus the
hardening/bundling/cleanup commit `ba0fd52`.