# Composable Template Design

## Overview

Tamidoc currently has one template shape: a **form** — a fixed-layout canvas of
absolutely-positioned components (text/image/shape/table), a set of merge
fields (`{{token}}`), and repeating groups. A filler types values into those
pre-placed fields and the renderer draws them at fixed coordinates
(`pdf-render/lib/template-pdf.tsx`).

This document introduces a second template kind: **document** — a composable,
block-based template for presentations, guides, tutorials, and "component
collection" documents. Instead of a fixed canvas, the template defines a
*catalog of allowed blocks + a theme*, and the document is composed at
fill/generate time as an ordered list of blocks. The same block list is what a
human builds in a block-picker UI and what an AI agent emits as JSON.

### Core contrast

| | form (existing) | document (new) |
|---|---|---|
| Structure | `canvas.components[]` at x/y/rotation | ordered `blocks[]` in flow layout |
| Fields | `fields[]` placed in content | block `inputs` (per-block schema) |
| Fill UX | fill pre-placed fields | pick block type → fill that block's inputs |
| Layout | absolute, multi-page tiles | flow: block-level wrap + page-break |
| AI input | `{ field: value }` | `{ title, blocks: [{type, inputs}] }` |
| Render | `template-pdf.tsx` | new `flow-pdf.tsx` |

## 1. Data Model

### 1.1 `Template.kind`

Add a discriminator to the existing `Template` entity (no new top-level entity —
versioning, publish, org scoping, tags, and RBAC are reused for free).

```ts
type TemplateKind = 'form' | 'document';

interface Template {
  kind: TemplateKind;              // default 'form' (backward compatible)
  // ...existing fields (canvas, groups, fields) used only when kind === 'form'

  // new, used only when kind === 'document'
  format?: 'document' | 'slides';
  documentConfig?: DocumentConfig; // allowed blocks + theme (schema definition)
  blocks?: DocBlock[];             // the author's composed starting document
}
```

`kind` default is `'form'` so every existing template is unaffected. The
`canvas`/`groups`/`fields` paths and the `documentConfig`/`blocks` paths are
mutually exclusive by kind.

### 1.2 `DocBlock`

A block is a discriminated union: a `type` plus a type-specific `inputs`
object, plus optional `children` for container blocks.

```ts
interface DocBlock {
  id: string;                       // client-generated UUID
  type: BlockType;                  // discriminator
  inputs: Record<string, unknown>;  // type-specific (see catalog)
  children?: DocBlock[];            // only for container blocks (columns)
  pageBreak?: boolean;              // slides: force a new slide before this block
}
```

### 1.3 `DocumentConfig` (the "component collection + layouts" a user defines)

```ts
interface DocumentConfig {
  format: 'document' | 'slides';
  pageSize: 'A4' | 'letter' | '16:9'; // 16:9 only meaningful for slides
  theme: {
    fontFamily: string;             // default 'Lato' (matches form renderer)
    baseFontSize: number;           // default 11
    colors: {
      primary: string;              // headings / accents
      heading: string;
      body: string;
      muted: string;
    };
    spacing: number;                // block gap, design px
  };
  allowedBlocks: BlockType[];       // which raw block types filler/AI may use
  sections?: Section[];             // curated composite layouts (optional)
}

interface Section {
  id: string;
  name: string;                     // "Title slide", "Agenda", "Team grid"
  description?: string;
  blocks: DocBlock[];               // a pre-built bundle of blocks
}
```

Two notions of "define components and layouts" fall out naturally:

- `allowedBlocks` — which component types are available (the component
  collection).
- `sections` — pre-composed layouts a filler can insert as one unit, then edit.

### 1.4 Versioning & publish snapshot

`TemplateVersion` gains the same document fields so version history covers both
kinds:

```ts
interface TemplateVersion {
  // ...existing canvas/groups/fields (form kind)
  kind: TemplateKind;
  format?: 'document' | 'slides';
  documentConfig?: DocumentConfig;
  blocks?: DocBlock[];
}
```

The publish-time snapshot (`Form.templateSnapshot`, `StackEntry.templateSnapshot`)
carries `{ name, canvas, groups, fields }` today. For document kind it must
carry `{ name, format, documentConfig, blocks, theme }`. Rather than widen the
existing `RenderTemplate` type, define a parallel type (see §5) so the form
renderer is untouched.

## 2. Block Catalog

Each block type has an input schema. The schema is the single source of truth
for three consumers:

1. **Fill UI** — generates the per-block input form.
2. **AI validation** — validates agent-emitted JSON before render.
3. **Renderer** — types for the flow renderer.

A type is declared as `{ type, schema, category }`. The catalog lives in
`pdf-render/lib/blocks` (shared between validation and rendering).

### 2.1 MVP block types

| type | category | inputs |
|---|---|---|
| `heading` | text | `{ text: string, level: 1..4, align?: 'left'|'center'|'right' }` |
| `paragraph` | text | `{ text: string }` |
| `bullet-list` | text | `{ items: string[], style?: 'disc'|'circle'|'square'|'dash' }` |
| `numbered-list` | text | `{ items: string[], start?: number }` |
| `image` | media | `{ src: string, alt?: string, caption?: string, width?: 'full'|'half'|'third' }` |
| `table` | data | `{ columns: {label: string, align?: string}[], rows: {cells: string[]}[], header?: boolean, zebra?: boolean }` |
| `quote` | text | `{ text: string, author?: string }` |
| `callout` | text | `{ tone: 'info'|'success'|'warning'|'danger', title?: string, body: string }` |
| `code` | text | `{ language?: string, code: string }` |
| `divider` | layout | `{}` |
| `stat-grid` | data | `{ stats: {value: string, label: string}[], columns?: number }` |
| `columns` | layout (container) | `{ columns: DocBlock[][], ratio?: number[] }` |

### 2.2 Phase-2 block types

| type | category | inputs |
|---|---|---|
| `chart` | data | `{ chartType: 'bar'|'line'|'pie', labels: string[], datasets: {label, values[]}[] }` |
| `key-value` | data | `{ rows: {key: string, value: string}[] }` |
| `accordion` | layout (container) | `{ items: {title, blocks: DocBlock[]}[] }` |
| `tabs` | layout (container) | `{ tabs: {label, blocks: DocBlock[]}[] }` |
| `embed` | media | `{ url: string, title?: string }` |

### 2.3 Input schema format

Use JSON Schema (draft 2020-12) so the AI contract is machine-checkable:

```json
{
  "$id": "block/heading",
  "type": "object",
  "required": ["type", "inputs"],
  "properties": {
    "type": { "const": "heading" },
    "inputs": {
      "type": "object",
      "required": ["text", "level"],
      "properties": {
        "text": { "type": "string" },
        "level": { "type": "integer", "minimum": 1, "maximum": 4 },
        "align": { "enum": ["left", "center", "right"] }
      }
    }
  }
}
```

The full document schema wraps the list:

```json
{
  "$id": "document",
  "type": "object",
  "required": ["blocks"],
  "properties": {
    "title": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": { "oneOf": ["block/heading", "block/paragraph", "..."] }
    }
  }
}
```

## 3. AI Contract

The AI agent emits a JSON document that is validated against the catalog and
then rendered identically to a human-composed document.

```json
{
  "title": "Study Guide: Algebra",
  "blocks": [
    { "type": "heading", "inputs": { "text": "Chapter 1", "level": 1 } },
    { "type": "paragraph", "inputs": { "text": "Linear equations take the form ..." } },
    { "type": "bullet-list", "inputs": { "items": ["slope", "intercept", "root"] } },
    { "type": "callout", "inputs": { "tone": "info", "body": "Remember to check your sign." } }
  ]
}
```

Validation rules on generate:

1. Every block `type` must exist in the catalog.
2. Every block `type` must be in the template's `allowedBlocks`.
3. Every block `inputs` must validate against its block schema.
4. Reject unknown/not-allowed blocks with a `422` listing the offending block
   id + reason (so an agent can self-correct).

MCP tool surface (future): `generate_document(templateId, { title, blocks })`
mirrors the existing `POST /templates/:id/generate` so agents and humans hit the
same path.

## 4. API

Extend the existing templates controller (kind lives on `Template`).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/organizations/:orgId/templates` | create; `CreateTemplateDto` gains `kind`, `format`, `documentConfig`, `blocks` |
| `GET` | `/organizations/:orgId/templates/:id` | returns `kind`, `format`, `documentConfig`, `blocks` |
| `POST` | `/organizations/:orgId/templates/:id/generate` | **new** — render document-kind from `{ title, blocks }` → PDF buffer |
| `POST` | `/organizations/:orgId/templates/:id/generate?format=html` | **new** — HTML export (later) |

`generate` behavior:

- Reject if `template.kind !== 'document'`.
- Resolve the template's `documentConfig` (default version, same logic as
  `generate-pdf`).
- Validate `blocks` against catalog + `allowedBlocks` (§3).
- Render via `FlowRenderService` (§5) and stream PDF.

Existing `generate-pdf` stays the form-kind path; `generate` is the
document-kind path. Both share the org-scoped `findOne` + version resolution.

## 5. Rendering (PDF first)

New renderer under `pdf-render/lib/`:

```
flow-layout.ts   # block → { height, pageBreak } flow engine (no absolute coords)
flow-pdf.tsx     # react-pdf flow rendering of DocBlock[] → Buffer
```

### 5.1 Layout model

- `format: 'document'` — continuous A4/letter pages; blocks stack vertically,
  wrap text, and break across pages at block boundaries (a block never splits
  mid-block in MVP; tables/image keep intact, `columns` break to next page).
- `format: 'slides'` — each top-level block is a slide, or `pageBreak: true`
  starts a new slide. Content taller than a slide is truncated/flagged (MVP).

### 5.2 Reuse from the form renderer

Extract and reuse the shared primitives from `template-pdf.tsx`:

- Font registration / `resolveFontPath` / `fontFamily` / weight mapping.
- Color helpers (`isTransparent`).
- Image resolution (`imageDataFromRaw`, `ImageResolver`).
- Token merge (`splitContent`, `asString`, `splitStyledRuns`) — block text still
  supports `{{token}}` placeholders if the author wants merge fields inside
  block inputs.

### 5.3 Output

`FlowRenderService.render(template, { title, blocks }) → Buffer`. PDF uses the
same Lato fonts and px→pt conversion (`PT = 72/96`) for consistency.

## 6. Fill UX (phase 2)

New page (mirrors `FillTemplatePage`):

- **Block canvas** — vertical live preview of the composed `blocks[]`.
- **Add block** — picker grouped by category, filtered to `allowedBlocks`; or
  "insert section" to drop a curated `Section` and then edit.
- **Per-block input form** — inspector/accordion generated from the block's
  JSON schema (reuse a schema→form renderer).
- **Actions** — reorder (drag), duplicate, delete, edit inputs.
- **Generate** — validates + renders PDF (calls `generate`).

A human's output is the exact same `{ title, blocks }` JSON an AI emits, so the
two paths converge on one validation + render pipeline.

## 7. Rollout Plan

### Phase 1 — schema + render (backend only)
1. `Template.kind`, `DocumentConfig`, `DocBlock`, `BlockType` types + Mongoose schema fields.
2. Block catalog + JSON Schema + `validateDocumentBlocks` in `pdf-render/lib/blocks`.
3. `flow-layout.ts` + `flow-pdf.tsx` flow renderer.
4. `POST /templates/:id/generate` endpoint + `FlowRenderService`.
5. Unit tests: block validation, flow layout page-breaks, render smoke test.

### Phase 2 — fill UX (frontend)
1. Block picker + per-block input form (schema-driven).
2. Live preview + reorder/duplicate/delete.
3. Section insertion.

### Phase 3 — AI + exports
1. MCP tool `generate_document`.
2. HTML export.
3. Slides polish (theme cover, presenter notes, chart blocks).

## 8. Open Questions

1. Should a `columns` block nest arbitrarily (deep nesting) or cap at one level
   (MVP = one level)?
2. Should `generate` accept a `version` override like `generate-pdf` does?
3. Block-level page-break: allow a block to split across pages (e.g. a long
   table/list) in v1, or keep "never split" and revisit?
4. Do block `inputs` need merge-field support (`{{token}}`) in v1, or is that a
   form-kind-only concern for now?

## 9. Backward Compatibility

- `kind` defaults to `'form'`; all existing templates, forms, and stack forms
  are unaffected.
- `canvas`/`groups`/`fields` remain required for form kind; `documentConfig`/
  `blocks` only present for document kind.
- No change to `Form`, `StackForm`, `Submission`, or `StackSubmission` schemas.
