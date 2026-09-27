/**
 * Server-side flow rendering of a composable template via @react-pdf/renderer.
 *
 * Unlike the Fixed-layout Template renderer (`template-pdf.tsx`), blocks are NOT
 * absolutely positioned — they are normal flow children and react-pdf performs
 * text wrap and page breaks natively. This is the same reason the form renderer
 * moved from pdfkit to react-pdf: the measuring engine is the drawing engine.
 *
 * Page model:
 *  - `document` — one flowing Page (react-pdf auto-paginates); a block with
 *    `pageBreak: true` is wrapped in `<View break>` to start a new page.
 *  - `slides`   — `partitionSlides` splits top-level blocks into slide groups,
 *    one `<Page>` per slide.
 *
 * Block inputs are literal text (no `{{token}}` merge in v1 — an AI or human
 * composes the final strings; see COMPOSABLE_TEMPLATE_DESIGN.md §8.4).
 */
import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image as PdfImage,
  renderToBuffer,
} from '@react-pdf/renderer';
import { ensureFontsRegistered, imageDataFromRaw } from './render-shared';
import { normalizeTheme, pageSizeFor, partitionSlides } from './flow-layout';
import { FONT_SIZE_MULTIPLIERS, getComponentStyle } from './theme-tokens';
import type { DocBlock, DocumentTheme, RenderDocument } from './document-types';

type ImageResolver = (value: string) => Promise<Buffer | null>;

interface RenderCtx {
  theme: DocumentTheme;
  imageCache: Map<string, Buffer | null>;
  /** Template-level per-component default styles (resolution level 4). */
  componentDefaults?: Record<string, unknown>;
  /** Apply `break` to `pageBreak` blocks (document format only; slides are
   * already partitioned). */
  honorBreak: boolean;
}

/**
 * Effective text color / size / background for one block, layering the
 * template's component defaults over the theme. Instance overrides (level 5)
 * plug into these same helpers when they land.
 */
function styledText(
  ctx: RenderCtx,
  type: string,
  base: { color: string; fontSize: number },
): { color: string; fontSize: number } {
  const override = getComponentStyle(ctx.componentDefaults, type);
  return {
    color: override.color ?? base.color,
    fontSize:
      base.fontSize *
      (override.fontSize ? (FONT_SIZE_MULTIPLIERS[override.fontSize] ?? 1) : 1),
  };
}

function styledBackground(
  ctx: RenderCtx,
  type: string,
  fallback: string,
): string {
  return getComponentStyle(ctx.componentDefaults, type).background ?? fallback;
}

/* ---------- image pre-resolution ------------------------------------------ */

async function collectImages(
  blocks: DocBlock[],
  imageCache: Map<string, Buffer | null>,
  resolveImage: ImageResolver,
): Promise<void> {
  for (const b of blocks) {
    if (b.type === 'image') {
      const src = (b.inputs?.src as string) || '';
      if (src && !src.startsWith('data:') && !imageCache.has(src)) {
        imageCache.set(src, await resolveImage(src));
      }
    } else if (b.type === 'section') {
      const kids = b.inputs?.blocks;
      if (Array.isArray(kids)) {
        await collectImages(kids as DocBlock[], imageCache, resolveImage);
      }
    } else if (b.type === 'columns') {
      const cols = b.inputs?.columns;
      if (Array.isArray(cols)) {
        for (const col of cols) {
          if (Array.isArray(col))
            await collectImages(col as DocBlock[], imageCache, resolveImage);
        }
      }
    }
  }
}

/* ---------- heading scale -------------------------------------------------- */

const HEADING_SCALE: Record<number, number> = { 1: 2, 2: 1.5, 3: 1.25, 4: 1.1 };
const CALLout_TONE: Record<string, string> = {
  info: '#e0f2fe',
  success: '#dcfce7',
  warning: '#fef9c3',
  danger: '#fee2e2',
};

/* ---------- block renderers ------------------------------------------------ */

function HeadingBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const level = (block.inputs.level as number) || 1;
  const base = styledText(ctx, 'heading', {
    color: t.colors.heading,
    fontSize: t.baseFontSize * (HEADING_SCALE[level] ?? 1.25),
  });
  return (
    <Text
      style={{
        fontFamily: t.fontFamily,
        fontSize: base.fontSize,
        fontWeight: level <= 2 ? 'bold' : 'normal',
        color: base.color,
        textAlign:
          (block.inputs.align as 'left' | 'center' | 'right') ?? 'left',
      }}
    >
      {(block.inputs.text as string) ?? ''}
    </Text>
  );
}

function ParagraphBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const base = styledText(ctx, 'paragraph', {
    color: t.colors.body,
    fontSize: t.baseFontSize,
  });
  return (
    <Text
      style={{
        fontFamily: t.fontFamily,
        fontSize: base.fontSize,
        color: base.color,
        lineHeight: 1.5,
      }}
    >
      {(block.inputs.text as string) ?? ''}
    </Text>
  );
}

function ListBlock({
  block,
  ctx,
  ordered,
}: {
  block: DocBlock;
  ctx: RenderCtx;
  ordered: boolean;
}): React.ReactElement {
  const t = ctx.theme;
  const listKey = ordered ? 'numbered-list' : 'bullet-list';
  const base = styledText(ctx, listKey, {
    color: t.colors.body,
    fontSize: t.baseFontSize,
  });
  const items = (block.inputs.items as string[]) ?? [];
  const start = (block.inputs.start as number) || 1;
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
          <Text
            style={{
              width: 18,
              fontSize: base.fontSize,
              color: t.colors.muted,
            }}
          >
            {ordered ? `${start + i}.` : '\u2022'}
          </Text>
          <Text
            style={{
              flex: 1,
              fontSize: base.fontSize,
              color: base.color,
              lineHeight: 1.5,
            }}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ImageBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement | null {
  const t = ctx.theme;
  const src = (block.inputs.src as string) ?? '';
  const img = imageDataFromRaw(src, ctx.imageCache);
  if (!img) return null;
  const width =
    block.inputs.width === 'half'
      ? '50%'
      : block.inputs.width === 'third'
        ? '33.33%'
        : '100%';
  return (
    <View>
      <PdfImage src={img.data} style={{ width, objectFit: 'contain' }} />
      {block.inputs.caption ? (
        <Text
          style={{
            fontSize: t.baseFontSize * 0.85,
            color: t.colors.muted,
            marginTop: 4,
          }}
        >
          {block.inputs.caption as string}
        </Text>
      ) : null}
    </View>
  );
}

function TableBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const columns =
    (block.inputs.columns as {
      label: string;
      align?: 'left' | 'center' | 'right';
    }[]) ?? [];
  const rows = (block.inputs.rows as { cells: string[] }[]) ?? [];
  const header = block.inputs.header !== false;
  const zebra = !!block.inputs.zebra;
  const base = styledText(ctx, 'table', {
    color: t.colors.body,
    fontSize: t.baseFontSize,
  });

  const cell = (
    text: string,
    key: number,
    opts: { bold?: boolean; fill?: string },
  ) => (
    <View
      key={key}
      style={{
        flex: 1,
        padding: 4,
        backgroundColor: opts.fill,
        borderBottom: '1pt solid #e7e5e4',
      }}
    >
      <Text
        style={{
          fontSize: base.fontSize,
          color: base.color,
          textAlign: columns[key]?.align ?? 'left',
          fontWeight: opts.bold ? 'bold' : 'normal',
        }}
      >
        {text}
      </Text>
    </View>
  );

  return (
    <View style={{ borderTop: '1pt solid #d6d3d1' }}>
      {header ? (
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: t.colors.primary + '22',
          }}
        >
          {columns.map((c, i) => cell(c.label, i, { bold: true }))}
        </View>
      ) : null}
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: 'row',
            backgroundColor: zebra && ri % 2 === 1 ? '#fafaf9' : undefined,
          }}
        >
          {columns.map((c, i) => cell(row.cells[i] ?? '', i, {}))}
        </View>
      ))}
    </View>
  );
}

function QuoteBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const base = styledText(ctx, 'quote', {
    color: t.colors.body,
    fontSize: t.baseFontSize * 1.1,
  });
  return (
    <View
      style={{
        borderLeft: `3pt solid ${t.colors.primary}`,
        paddingLeft: 10,
        marginVertical: 4,
      }}
    >
      <Text
        style={{
          fontSize: base.fontSize,
          color: base.color,
          // The bundled Lato family includes regular and bold only.
          fontStyle: t.fontFamily === 'Lato' ? 'normal' : 'italic',
          lineHeight: 1.5,
        }}
      >
        {(block.inputs.text as string) ?? ''}
      </Text>
      {block.inputs.author ? (
        <Text
          style={{
            fontSize: t.baseFontSize * 0.85,
            color: t.colors.muted,
            marginTop: 4,
          }}
        >
          {'\u2014 '}
          {block.inputs.author as string}
        </Text>
      ) : null}
    </View>
  );
}

function CalloutBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const tone =
    (block.inputs.tone as string) || (block.inputs.variant as string) || 'info';
  const base = styledText(ctx, 'callout', {
    color: t.colors.body,
    fontSize: t.baseFontSize,
  });
  const titleStyle = styledText(ctx, 'callout', {
    color: t.colors.heading,
    fontSize: t.baseFontSize,
  });
  return (
    <View
      style={{
        backgroundColor: styledBackground(
          ctx,
          'callout',
          CALLout_TONE[tone] ?? CALLout_TONE.info,
        ),
        padding: 10,
        borderRadius: 4,
      }}
    >
      {block.inputs.title ? (
        <Text
          style={{
            fontSize: titleStyle.fontSize,
            fontWeight: 'bold',
            color: titleStyle.color,
            marginBottom: 2,
          }}
        >
          {block.inputs.title as string}
        </Text>
      ) : null}
      <Text
        style={{
          fontSize: base.fontSize,
          color: base.color,
          lineHeight: 1.5,
        }}
      >
        {(block.inputs.body as string) ?? ''}
      </Text>
    </View>
  );
}

function CodeBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const base = styledText(ctx, 'code', {
    color: '#fafaf9',
    fontSize: t.baseFontSize * 0.9,
  });
  return (
    <View
      style={{
        backgroundColor: styledBackground(ctx, 'code', '#1c1917'),
        padding: 10,
        borderRadius: 4,
      }}
    >
      <Text
        style={{
          fontFamily: 'Courier',
          fontSize: base.fontSize,
          color: base.color,
        }}
      >
        {(block.inputs.code as string) ?? ''}
      </Text>
    </View>
  );
}

function DividerBlock({ ctx }: { ctx: RenderCtx }): React.ReactElement {
  return (
    <View
      style={{
        borderBottom: `1pt solid ${ctx.theme.colors.muted}`,
        marginVertical: 4,
      }}
    />
  );
}

function StatGridBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const stats =
    (block.inputs.stats as { value: string; label: string }[]) ?? [];
  const columns = (block.inputs.columns as number) || Math.max(stats.length, 1);
  const base = styledText(ctx, 'stat-grid', {
    color: t.colors.primary,
    fontSize: t.baseFontSize * 1.6,
  });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {stats.map((s, i) => (
        <View
          key={i}
          style={{
            width: `${100 / columns}%`,
            paddingRight: t.spacing,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontSize: base.fontSize,
              fontWeight: 'bold',
              color: base.color,
            }}
          >
            {s.value}
          </Text>
          <Text
            style={{ fontSize: t.baseFontSize * 0.85, color: t.colors.muted }}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const horizontal = block.inputs.direction === 'horizontal';
  const justifyMap: Record<
    string,
    'flex-start' | 'center' | 'flex-end' | 'space-between'
  > = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
  };
  const alignMap: Record<
    string,
    'flex-start' | 'center' | 'flex-end' | 'stretch'
  > = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
  };
  const kids = (block.inputs.blocks as DocBlock[]) ?? [];
  return (
    <View
      style={{
        flexDirection: horizontal ? 'row' : 'column',
        justifyContent:
          justifyMap[block.inputs.justify as string] ?? 'flex-start',
        alignItems: alignMap[block.inputs.align as string] ?? 'stretch',
        gap: t.spacing,
      }}
    >
      {kids.map((child) => (
        <View
          key={child.id}
          wrap={child.type !== 'table' && child.type !== 'image'}
          break={ctx.honorBreak && child.pageBreak}
          style={horizontal ? { flex: 1, minWidth: 0 } : {}}
        >
          {renderBlock(child, ctx)}
        </View>
      ))}
    </View>
  );
}

function ColumnsBlock({
  block,
  ctx,
}: {
  block: DocBlock;
  ctx: RenderCtx;
}): React.ReactElement {
  const t = ctx.theme;
  const cols = (block.inputs.columns as DocBlock[][]) ?? [];
  const ratio = (block.inputs.ratio as number[]) ?? [];
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing }}>
      {cols.map((colBlocks, i) => (
        <View key={i} style={{ flex: ratio[i] ?? 1 }}>
          {renderBlocks(colBlocks ?? [], ctx)}
        </View>
      ))}
    </View>
  );
}

/* ---------- block dispatch ------------------------------------------------- */

function renderBlock(
  block: DocBlock,
  ctx: RenderCtx,
): React.ReactElement | null {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} ctx={ctx} />;
    case 'paragraph':
      return <ParagraphBlock block={block} ctx={ctx} />;
    case 'bullet-list':
      return <ListBlock block={block} ctx={ctx} ordered={false} />;
    case 'numbered-list':
      return <ListBlock block={block} ctx={ctx} ordered={true} />;
    case 'image':
      return <ImageBlock block={block} ctx={ctx} />;
    case 'table':
      return <TableBlock block={block} ctx={ctx} />;
    case 'quote':
      return <QuoteBlock block={block} ctx={ctx} />;
    case 'callout':
      return <CalloutBlock block={block} ctx={ctx} />;
    case 'code':
      return <CodeBlock block={block} ctx={ctx} />;
    case 'divider':
      return <DividerBlock ctx={ctx} />;
    case 'stat-grid':
      return <StatGridBlock block={block} ctx={ctx} />;
    case 'section':
      return <SectionBlock block={block} ctx={ctx} />;
    case 'columns':
      return <ColumnsBlock block={block} ctx={ctx} />;
    default:
      return null;
  }
}

function renderBlocks(
  blocks: DocBlock[],
  ctx: RenderCtx,
): React.ReactElement[] {
  const t = ctx.theme;
  return blocks.flatMap((block) => {
    const node = renderBlock(block, ctx);
    if (!node) return [];
    const unsplittable = block.type === 'table' || block.type === 'image';
    const viewProps: {
      key: string;
      style: Record<string, unknown>;
      break?: boolean;
      wrap?: boolean;
    } = {
      key: block.id,
      style: { marginBottom: t.spacing },
    };
    if (ctx.honorBreak && block.pageBreak) viewProps.break = true;
    if (unsplittable) viewProps.wrap = false;
    return [React.createElement(View as any, viewProps as any, node)];
  });
}

/* ---------- entry point ---------------------------------------------------- */

export async function renderDocumentPdf(
  doc: RenderDocument,
  resolveImage: ImageResolver,
): Promise<Buffer> {
  ensureFontsRegistered();
  const theme = normalizeTheme(doc.theme);
  const size = pageSizeFor(doc);

  const imageCache = new Map<string, Buffer | null>();
  await collectImages(doc.blocks, imageCache, resolveImage);

  const ctx: RenderCtx = {
    theme,
    imageCache,
    componentDefaults: doc.componentDefaults,
    honorBreak: doc.format === 'document',
  };

  // Per-page chrome: `fixed` elements repeat on every physical page.
  const showHeader = !!theme.header?.enabled;
  const showFooter = !!theme.footer?.enabled || !!theme.pageNumbering?.enabled;
  const headerText = (theme.header?.text ?? doc.title ?? doc.name ?? '').trim();
  const footerText = (theme.footer?.text ?? '').trim();
  const numberFormat = theme.pageNumbering?.format ?? 'Page {page} / {total}';
  const padding = theme.pagePadding ?? 48;
  const pageStyle = {
    fontFamily: theme.fontFamily,
    paddingTop: padding + (showHeader ? 28 : 0),
    paddingLeft: padding,
    paddingRight: padding,
    paddingBottom: padding + (showFooter ? 24 : 0),
  };
  const headerEl = showHeader ? (
    <View
      key="chrome-header"
      fixed
      style={{
        position: 'absolute',
        top: Math.max(12, padding - 20),
        left: padding,
        right: padding,
        borderBottom: '1pt solid #e7e5e4',
        paddingBottom: 6,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.baseFontSize * 1.1,
          fontWeight: 'bold',
          color: theme.colors.heading,
          maxLines: 1,
        }}
      >
        {headerText}
      </Text>
    </View>
  ) : null;
  const footerEl = showFooter ? (
    <View
      key="chrome-footer"
      fixed
      style={{
        position: 'absolute',
        bottom: Math.max(12, padding - 24),
        left: padding,
        right: padding,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTop: '1pt solid #e7e5e4',
        paddingTop: 6,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.baseFontSize * 0.85,
          color: theme.colors.muted,
          maxLines: 1,
          flex: 1,
        }}
      >
        {theme.footer?.enabled ? footerText : ''}
      </Text>
      {theme.pageNumbering?.enabled ? (
        <Text
          style={{
            fontFamily: theme.fontFamily,
            fontSize: theme.baseFontSize * 0.85,
            color: theme.colors.muted,
          }}
          render={({
            pageNumber,
            totalPages,
          }: {
            pageNumber: number;
            totalPages: number;
          }) =>
            numberFormat
              .replace('{page}', String(pageNumber))
              .replace('{total}', String(totalPages))
          }
        />
      ) : (
        <Text />
      )}
    </View>
  ) : null;

  const pages: React.ReactElement[] = [];
  if (doc.format === 'slides') {
    for (const slide of partitionSlides(doc.blocks)) {
      pages.push(
        React.createElement(
          Page as any,
          {
            key: pages.length,
            size: [size.width, size.height],
            style: pageStyle,
          },
          [...renderBlocks(slide, ctx), headerEl, footerEl],
        ),
      );
    }
  } else {
    const blocks = renderBlocks(doc.blocks, ctx);
    const content = doc.title
      ? [
          React.createElement(
            Text as any,
            {
              key: 'title',
              style: {
                fontFamily: theme.fontFamily,
                fontSize: theme.baseFontSize * 2.2,
                fontWeight: 'bold',
                color: theme.colors.heading,
                marginBottom: theme.spacing * 2,
              },
            },
            doc.title,
          ),
          ...blocks,
        ]
      : blocks;
    pages.push(
      React.createElement(
        Page as any,
        { key: 0, size: [size.width, size.height], style: pageStyle },
        [...content, headerEl, footerEl],
      ),
    );
  }

  const document = React.createElement(
    Document as any,
    { title: doc.title ?? doc.name },
    pages,
  );
  return renderToBuffer(document as any);
}
