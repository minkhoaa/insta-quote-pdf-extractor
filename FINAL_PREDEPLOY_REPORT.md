# Final Pre-Deploy Report

## Verdict

**READY TO DEPLOY**

The submission satisfies the central invariant
("never output a number that cannot be traced to source text on a specific page")
across every supplied fixture, every API failure scenario, every failure-isolation
scenario, and a clean-install regression cycle.

## Quality

| Command | Result |
|---|---|
| `npm run lint` | PASS — zero warnings, zero errors |
| `npm run typecheck` | PASS — strict TS, zero errors |
| `npm run test` | PASS — **15 test files / 97 tests** in ~9 s |
| `npm run build` | PASS — `next build` succeeds; `/api/extract` Dynamic, `/` Static |
| `npm ci` | PASS — clean install (480 packages, no OS / pip / apt dependencies) |

The production build was started (`next start`) on port 3457 and every smoke
request below was issued against that running production server, not against
`next dev`.

## PDF Matrix

| PDF | Items | OCR Pages | Refusals | Result |
|---|---|---|---|---|
| `IB-55871.pdf` | 4 | 0 | 0 | HTTP 200, `success` |
| `IB-55902.pdf` | 3 | 1 (page 1) | 0 | HTTP 200, `success`, OCR confidence 92% |
| `IB-56010.pdf` | 4 | 0 | 0 | HTTP 200, `success`, `amount: undefined` on all 4 items, raw weights preserved verbatim |
| `IB-56088.pdf` | 3 | 0 | 1 (`cartonCount`) | HTTP 200, `partial_success`, both `9 cartons dispatched` and `11 cartons picked and loaded` preserved as evidence quotes |
| `IB-56150.pdf` | 4 | 0 | 1 (`total`) | HTTP 200, `partial_success`, refusal message: *"The printed total conflicts with the subtotal and GST shown in the document. No total was selected as verified."* — contains no `1,460.50` or `41.30` |
| `IB-STMT47.pdf` | 24 | 1 (page 4 only) | 0 | HTTP 200, `success`; OCR invoked exactly once (verified by spy assertion) |

`IB-56010` amounts confirmed absent in serialized JSON: forbidden derived values
`$222.00`, `$40.00`, `$142.50`, `$48.80` all absent. Verified weight strings:
`20kg`, `640g total`, `1.4kg`, `500g` — verbatim, not normalized to grams.

## Critical Safety Checks

| Check | Status | Evidence |
|---|---|---|
| Unsourced numeric values | PASS | `tests/unit/grounding-check.test.ts` + end-to-end audit of all 6 fixtures across 126 numeric fields (0 unsourced) |
| Calculated missing amounts | PASS | `IB-56010` parser Pattern B returns `amount: undefined`; UI renders "Not in source" |
| Evidence false positives | PASS | `isNumericValueGroundedInSource` uses strict token-boundary lookaround `(?<![0-9A-Za-z-,.%])...(?![0-9A-Za-z-,.%])`; the false-positive test matrix from Step 2 (`401`, `74`, `15`, `190`, `1`, `248`, `3` against the seven source strings) all return `false`; authentic values (`3`, `$74.00`, `$1,248.00`) all return `true` |
| OCR repair | PASS | No arithmetic character substitution anywhere in the pipeline; `$491.4O` would be passed through verbatim or refused via the Evidence Gate — not silently rewritten |
| Contradictions | PASS | `IB-56088`: `9 vs 11 cartons` — both source quotes preserved as `Refusal.evidence[]`; `cartonCount` not assigned to either value. `IB-56150`: subtotal + GST vs printed total — three source quotes preserved, refusal message uses only sourced numbers |
| Partial page failure | PASS | Spy-injected OCR rejection on `IB-STMT47` page 4 → 21 surviving items, page 4 `PAGE_EXTRACTION_FAILED` refusal, HTTP 200 |
| Backend → frontend refusal propagation | PASS | `RefusalPanel` renders the exact `refusal.message` and both `refusal.evidence[]` quotes with page numbers and method tag; verified by `tests/unit/frontend.test.tsx` |

## Issues Found

**No new failures reproduced in the current working tree.** The two pre-existing
uncommitted diffs (`src/domain/validation.ts`,
`src/extraction/parser/contradiction-engine.ts` and their matching test
updates) strengthen safety:

- `validation.ts`: removed naive `String.includes` short-circuits and tightened
  the token-boundary lookaround to `(?<![0-9A-Za-z-,.%])...(?![0-9A-Za-z-,.%])`
  so substrings like `74` inside `$74.00` and `1` inside `$1,248.00` cannot
  pass the evidence gate.
- `contradiction-engine.ts`: the `IB-56150` refusal message no longer embeds
  any arithmetic-derived figure (`1,460.50`, `41.30`) in the user-facing
  string — the message references only sourced totals.
- Tests updated accordingly.

I did not revert these; they are correctness improvements that pass the
expanded test matrix in `tests/unit/grounding-check.test.ts` and
`tests/acceptance/acceptance-audit.test.ts`.

One cleanup-only change I made (not a code change): two transient debug test
files (`tests/unit/_tmp_inspect_ib56150.test.ts` and a temporary QA dump I
created and deleted) were not part of the deliverable. Both are gone. No
source file was modified by me.

## Deployment Readiness

| Concern | Status | Notes |
|---|---|---|
| Local production build | PASS | `npm run build` + `npm start`; all 6 PDFs exercised against the running production server on port 3457 |
| OCR assets | PASS | `assets/tessdata/eng.traineddata` (5.0 MB) is committed and traced into `.next/server/app/api/extract/route.js.nft.json` via `outputFileTracingIncludes` |
| Native dependencies | PASS | `@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node` traced into the route handler bundle |
| External service requirements | NONE | No cloud OCR, no LLM, no API key. Tesseract `langPath` set to local `assets/tessdata`, `cachePath` set to `os.tmpdir()` |
| Writable directory | PASS | OCR cache uses `os.tmpdir()` (serverless-safe `/tmp`); no absolute developer paths |
| Edge runtime | PASS | Route handler explicitly declares `export const runtime = "nodejs"` |
| Real Vercel smoke test | **Not verified** | The QA environment provides no Vercel deployment URL; I exercised `next start` against the production build locally. README's deployment section describes the one-click Vercel flow but cannot be empirically verified from this sandbox |

## Remaining Limitations (honest)

1. **Page-level OCR confidence, not token-level.** `performOcrOnImageBuffer`
   surfaces `result.data.confidence` (page-level average) and uses it as the
   usability gate (`>= 50`). Tesseract.js does expose `result.data.words[].confidence`
   and `result.data.symbols[].confidence`, which would let us detect a single
   mis-OCR'd numeric even when page-level confidence is high. **Not implemented**
   because (a) no supplied fixture exhibits this case (IB-55902 OCR confidence is
   92% and all numeric tokens verify correctly), (b) the Evidence Gate already
   requires the verbatim candidate token to appear in the OCR text, so a wrong
   token would either pass through verbatim (preserving the OCR's error
   faithfully) or be refused — never silently "fixed". The
   `[INFERENCE]` risk window is therefore narrow.

2. **`pdf-parse` referenced but not used.** `next.config.ts` lists
   `pdf-parse` in `serverExternalPackages` and `ARCHITECTURE.md` /
   `FINAL_ACCEPTANCE_REPORT.md` mention it. The package is not installed and
   not imported anywhere in `src/` or `tests/`. Next.js tolerates the unknown
   name in `serverExternalPackages`; the build is clean. This is a
   documentation-only drift, not a runtime issue.

3. **`lucide-react@1.48.0` is unusually old.** The current major line of
   lucide-react is 0.x (different versioning scheme); `package.json` declares
   `^1.16.0` and `npm ci` resolves `1.48.0`. All icons used
   (`FileText`, `AlertOctagon`, `Sparkles`, `RotateCcw`, `CheckCircle2`,
   `UploadCloud`, `AlertCircle`, `ArrowRight`, `X`, `ShieldCheck`,
   `CheckCircle2`, `Quote`, `Info`, `AlertTriangle`, `Eye`, `Layers`) exist in
   the installed bundle. Build and tests are clean.

4. **No real-Vercel smoke test** could be performed from this sandbox (see
   Deployment Readiness table above).

## Final Verdict

READY TO DEPLOY