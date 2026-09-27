PDF import builds fixed canvas components and optionally adds a separate layer of fillable inputs using TypeSafe's Jev model. The upload screen enables detection by default and displays saved usage and estimated cost. Uncheck detection to import artwork alone. The underlying `PdfImportService.importPdf` still performs artwork-only extraction for fidelity tooling; the authenticated HTTP route uses `PdfImportWorkflowService`.

## Jev setup and behavior

Set `TYPESAFE_API_KEY` in the backend environment. The default model is pinned to `jev-1.13.0`; `TYPESAFE_MODEL` overrides it. Missing credentials skip detection with an explicit warning, while artwork imports normally. API keys never reach the browser.

Code finds candidate regions from PDF form widgets, underscore/dot/dash blanks, checkbox glyphs, empty ruled lines and boxes. Jev receives bounded text/geometry records and answers a Choice (input type or `none`) and a Noul (explicitly required) per candidate in a single request. These questions are independent. Accepted inputs keep their source label verbatim as the field name (names double as display labels: no slugification) with editable text merge-token overlays; repeated labels share one field so every occurrence renders the same value. Dropdown widgets retain their source options. Source artwork is unchanged, including raster fallback pages. Jev is the only AI provider used by PDF import.

Acceptance requires both the selected probability and Choice confidence to meet `PDF_IMPORT_FIELD_CONFIDENCE` (default `0.75`). Required is set only for a native PDF required flag or required probability at least `0.9`. These are initial policy thresholds, not measured accuracy guarantees. Uncertain candidates remain absent from the field list and are counted for manual review.

Detection handles at most 120 candidates per import, in batches of 12. Each request has at most a 12-second timeout and the detection stage has a 60-second budget. A provider failure stops further batches without retries; successful earlier batches remain usable. Truncation and failures produce warnings. Jev accepts text only: scanned/image-only pages need OCR (not included) or manual fields. Blank text geometry is approximate; rotated text blanks, radio groups, and complex rasterized graphical regions require manual placement.

## Stored metrics

MongoDB collection `pdf_import_runs` records each authenticated import before any paid call: user/organization, source SHA-256 and byte count, timestamps, import status, pages, threshold, field judgments/probabilities, candidate/evaluated/detected/uncertain counts, and timings. It does not store the uploaded PDF, source text, filename, provider error bodies or credentials. A process interrupted mid-import leaves a `processing` record; its recorded usage may be incomplete.

Each request stores the requested/returned model (requested model is at run level), request ID if provided, HTTP status, duration, input/output tokens, pricing snapshot, estimated USD cost and a sanitized error code. Reported usage is retained even for malformed answers. Unreported usage and unknown prices are `null`, never silently zero. Aggregated `inputTokens`/`outputTokens` and `knownCostUsd` sum known values; `usageComplete` and `costComplete` indicate completeness, and total `estimatedCostUsd` is null when any request cost is unknown. Skipped detection makes zero requests and has zero cost.

The documented rate for `jev-1.13.0` is $0.042 per million input tokens with free output ([TypeSafe models](https://docs.typesafe.ai/models), checked September 20, 2026). Cost is an estimate calculated from reported tokens, not an invoice. Other returned model versions require explicit `TYPESAFE_INPUT_USD_PER_MILLION` and `TYPESAFE_OUTPUT_USD_PER_MILLION` overrides; otherwise their cost is unknown. Set overrides for contracted prices or pricing changes. See the [HTTP API](https://docs.typesafe.ai/api) for the request/usage contract.

- `POST /api/pdf-import`: multipart `file` and optional `detectFields=true|false`; response includes `fields`, `warnings`, and `detection` metrics/run ID.
- `GET /api/pdf-import/runs`: the current user's latest 50 runs in the active organization, including metrics.
- `GET /api/pdf-import/runs/:id`: the same scoped run with raw field decisions.

All endpoints require JWT authentication; history/detail never accept a user or organization from query parameters. MongoDB must be available to reserve the run before detection. The import dialog's recent history reads these saved metrics after reload.

## Artwork fidelity

mPDF documents using DejaVu Serif Condensed import as editable text with the original regular/bold/italic faces and Turkish glyphs. DejaVu 2.37 is bundled in both the editor and exporter (source and license are in the font asset directories). Square-capped horizontal and vertical table rules remain editable shapes with their original cap extent. Previously flattened templates need to be reimported from their original PDF.

Unknown fonts, unavailable font styles, and extended characters in standard PDF fonts use a bundled substitute: DejaVu Sans, Serif Condensed, or Sans Mono. Font-name clues and PDF generic family metadata select the family; all three include regular, bold, italic, and bold italic faces. Substitution emits a per-page warning and keeps text editable instead of flattening the page. Preview and PDF export fit unchanged substituted text to its original run widths and baselines. Saving retains this layout; editing the content, typography, or width restores normal wrapping in the chosen family. Substitutions preserve placement, not an exact match to the source glyph shapes. The bundled fonts cover Turkish and many other scripts, but cannot recover missing Unicode mappings or provide every symbol/script.

The previous importer coalesced differently styled text, rounded font sizes, reflowed paragraphs, substituted Lato throughout, and stacked all shapes below images/text. It discarded thin rules, default-black paths, some page borders, monochrome/small images, and artwork past low extraction caps. Complex paths were transformed twice, and compound fills, dashes, clipping and alpha were not preserved correctly.

The import path groups adjacent text into editable paragraphs, retaining source fragments and baselines for unchanged text. Editing content, typography, or width restores normal paragraph wrapping. Columns, table rules, pages, and intervening artwork keep unrelated text separate. Supported font families, fractional sizes, bold/italic, inline colors, rotation, and PDF paint order survive import. Underlines, strikeouts, rules and table borders remain their original graphical paths. Input detection adds overlays after this extraction.

Template persistence retains font family, ascent and paragraph fragment metadata. PDF SVG text sets font attributes directly on Text/Tspan: putting these attributes inside style makes react-pdf fall back to Helvetica, which corrupts Turkish glyphs. The built renderer resolves bundled fonts independently of its working directory and fails explicitly if assets are missing. Already-corrupted exports must be reimported from the original source PDF.

Simple shapes stay editable. Complex or clipped paths and transformed images use lossless PNG components. Unsupported features (including outlined text, gradients, masks, and extraction limits) trigger a complete page image with a warning, so saving/exporting does not silently lose artwork. Source reference backgrounds alone are never relied on for export. Blank pages survive; mixed page sizes are padded to the shared canvas without scaling artwork.

Import accuracy has explicit limits: PDF.js may normalize word spacing; mapped standard font metrics and antialiasing can vary slightly. Fallback artwork is a raster image, not independently editable text/shapes. References/fallbacks default to scale 3 (216 dpi), capped at 4096 pixels per side. The tests are generated fixtures, not a guarantee for every PDF producer.

Validation from `apps/api`:

```
npx jest --runInBand src/pdf-import
npm run test:render
npx ts-node --transpile-only scripts/verify-pdf-fidelity.ts
```

The integration tests read actual PDF operator streams. The round-trip check also exports imported components, verifies text position and styling, compares rendered artwork, and checks that a fallback page survives export pixel-for-pixel. It saves source/export PNGs in the system temporary directory under `tamidoc-pdf-fidelity` for visual inspection.
