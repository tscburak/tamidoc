import { importedFontFamily } from './import-fonts';
import { importedTextFragments } from './imported-text';
/**
 * Server-side PDF rendering of a filled template via @react-pdf/renderer.
 *
 * Why react-pdf and not pdfkit: the live preview is rendered by the browser
 * (Lato, CSS layout) and the previous pdfkit path used a separate layout
 * engine (fontkit-based wrapping) → wrap points drifted at every
 * `{{token}}` boundary, especially when a token changed the run's font or
 * size. react-pdf uses fontkit too but the wrap/measure happens in the same
 * engine that draws, and — when the same font file is used on the client
 * preview — drift reduces to ~0 instead of "every line breaks wrong".
 *
 * Pixel-coordinate system: the design canvas is authored in px @ 96 DPI; PDF
 * pages are @ 72 DPI. react-pdf has no DPI concept beyond the unit, so we
 * convert by `PT = 72/96` once and treat every coordinate as points. The page
 * size is declared explicitly via `size={[w, h]}`.
 *
 * Fonts: Lato Regular/Bold .ttf files live under src/pdf-render/assets/fonts
 * (same files the backend served to pdfkit earlier) and are registered with
 * react-pdf's `Font.register`. The frontend's `ComponentBody` already loads
 * the same family on the client preview via `@font-face`, so measurements on
 * both sides use the same glyphs.
 *
 * Fidelity notes (vs. the live HTML preview):
 * - react-pdf supports a subset of CSS: flexbox, absolute position, borders,
 *   padding. No `border-radius` → drawn shapes use `<Svg><Path>` for true
 *   rounded rectangles / ellipses.
 * - Per-run font/size inside a `<Text>` isn't possible (react-pdf wraps the
 *   whole `<Text>` node using its single font). We render styled runs as
 *   sibling `<Text>` elements inside a parent `<Text>` so wrap still works on
 *   the resolved string (font = base); inline chips lose their visual font
 *   change but keep underline/strikethrough via `textDecoration`.
 */
import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Tspan,
  Font,
  Image as PdfImage,
  Svg,
  Path,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { layoutStacked, type StackedLayoutItem } from './layout';
import { splitContent, asString, splitStyledRuns } from './merge';
import type { FillValues, RenderComponent, RenderTemplate } from './types';
import {
  PT,
  p,
  ensureFontsRegistered,
  fontFamily,
  fontWeightFor,
  isTransparent,
  imageDataFromRaw,
} from './render-shared';

type Resolver = (token: string) => string;

type ImageResolver = (value: string) => Promise<Buffer | null>;

/* ---------- token resolution --------------------------------------------- */

function makeResolver(
  values: FillValues,
  groupById: Map<string, RenderTemplate['groups'][number]>,
  itemGroupId: string | undefined,
  instanceIndex: number | undefined,
  fields: RenderTemplate['fields'],
): Resolver {
  return (token) => {
    const field = fields.find((f) => f.name === token && (f.groupId || undefined) === itemGroupId);
    const display = (value: unknown) => field?.type === 'checkbox' ? (value === 'true' ? 'X' : '\u00a0') : asString(value);
    if (itemGroupId && instanceIndex != null) {
      const g = groupById.get(itemGroupId);
      const arr = g ? values[g.name] : undefined;
      if (Array.isArray(arr)) return display(arr[instanceIndex]?.[token]);
      return display('');
    }
    return display(values[token]);
  };
}

/* ---------- text wrapping at a token-aware <Text> ------------------------- */

/** Preserve source positions for untouched PDF text. Edited paragraphs use
 * normal wrapping, inline marks and explicit author-entered line breaks. */
function TextBody({
  c,
  resolve,
  fitToWidth,
}: {
  c: Extract<RenderComponent, { kind: 'text' }>;
  resolve: Resolver;
  fitToWidth?: boolean;
}): React.ReactElement {
  const fragments = importedTextFragments(c);
  if (fragments) {
    return (
      <View style={{ width: p(c.width), height: p(c.height) }}>
        {fragments.map((fragment, i) => (
          <View key={i} style={{
            position: 'absolute', left: p(fragment.x), top: 0,
            width: p(fragment.width), height: p(c.height),
          }}>
            <TextBody resolve={resolve} fitToWidth={fragment.fitWidth === true} c={{
              ...c,
              importedText: undefined,
              content: c.content.slice(fragment.start, fragment.end),
              width: fragment.width,
              fontAscent: fragment.baseline / c.fontSize,
              marks: c.marks
                ?.filter((m) => m.end > fragment.start && m.start < fragment.end)
                .map((m) => ({
                  ...m,
                  start: Math.max(m.start, fragment.start) - fragment.start,
                  end: Math.min(m.end, fragment.end) - fragment.start,
                })),
            }} />
          </View>
        ))}
      </View>
    );
  }
  if (!c.importedText && Number.isFinite(c.fontAscent) && !c.content.includes('\n') && !c.content.includes('{{')) {
    const runs = splitStyledRuns(c.content, c.marks, c.fontSize, c.fontWeight, c.fontStyle,
      c.textDecoration, c.color, resolve);
    const widths = runs.map(run => {
      const face = Font.getFont({ fontFamily: importedFontFamily(c.fontFamily) ?? fontFamily(run.fontWeight === 'bold'),
        fontWeight: fontWeightFor(run.fontWeight), fontStyle: run.fontStyle as any }).data;
      return face ? face.layout(run.text).positions.reduce((sum: number, pos: { xAdvance: number }) => sum + pos.xAdvance, 0) * run.fontSize / face.unitsPerEm : 0;
    });
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const viewWidth = fitToWidth && totalWidth > 0 ? totalWidth : c.width;
    let x = c.align === 'center' ? (c.width - totalWidth) / 2 : c.align === 'right' ? c.width - totalWidth : 0;
    // The renderer supports SVG font attributes, but SVGTextProps omits them.
    const svgTextProps = { x: 0, y: c.fontAscent! * c.fontSize, fill: c.color,
      fontFamily: importedFontFamily(c.fontFamily) ?? fontFamily(c.fontWeight === 'bold'),
      fontSize: c.fontSize, fontWeight: fontWeightFor(c.fontWeight), fontStyle: c.fontStyle };
    return (
      <Svg width={p(c.width)} height={p(c.height)} viewBox={`0 0 ${viewWidth} ${c.height}`} preserveAspectRatio="none">
        <Text {...svgTextProps}>
          {runs.map((run, i) => {
            const left = x;
            x += widths[i];
            // SVG text layout reads font properties from props, not style.
            // A style-only Tspan falls back to Helvetica and corrupts Turkish glyphs.
            const spanProps = { x: left, fill: run.color,
              fontFamily: importedFontFamily(c.fontFamily) ?? fontFamily(run.fontWeight === 'bold'),
                fontSize: run.fontSize, fontWeight: fontWeightFor(run.fontWeight), fontStyle: run.fontStyle as any,
                textDecoration: run.textDecoration as any };
            return <Tspan key={i} {...spanProps}>{run.text}</Tspan>;
          })}
        </Text>
      </Svg>
    );
  }
  const lineCount = (c.content.match(/\n/g) || []).length + 1;
  const calculatedHeight = c.fontSize * c.lineHeight * lineCount;
  const containerHeight = Math.max(c.height, calculatedHeight);

  const baseStyle: any = {
    width: '100%',
    height: p(containerHeight),
    fontFamily: importedFontFamily(c.fontFamily) ?? fontFamily(
      c.fontWeight === 'semibold' || c.fontWeight === 'bold',
    ),
    fontSize: `${p(c.fontSize)}pt`,
    lineHeight: c.lineHeight,
    color: c.color,
    textAlign: c.align as any,
    fontWeight: fontWeightFor(c.fontWeight),
    fontStyle: c.fontStyle as any,
    textDecoration:
      c.textDecoration === 'underline'
        ? 'underline'
        : c.textDecoration === 'line-through'
          ? 'line-through'
          : 'none',
  };

  if (c.marks && c.marks.length > 0) {
    const runs = splitStyledRuns(
      c.content,
      c.marks,
      c.fontSize,
      c.fontWeight,
      c.fontStyle,
      c.textDecoration,
      c.color,
      resolve,
    );
    return (
      <Text style={baseStyle}>
        {runs.map((run, i) => (
          <Text
            key={i}
            style={{
              fontFamily: importedFontFamily(c.fontFamily) ?? fontFamily(
                run.fontWeight === 'semibold' || run.fontWeight === 'bold',
              ),
              fontSize: `${p(run.fontSize)}pt`,
              fontWeight: fontWeightFor(run.fontWeight),
              fontStyle: run.fontStyle as any,
              textDecoration:
                run.textDecoration === 'underline'
                  ? 'underline'
                  : run.textDecoration === 'line-through'
                    ? 'line-through'
                    : 'none',
              color: run.color,
            }}
          >
            {run.text}
          </Text>
        ))}
      </Text>
    );
  }

  const merged = splitContent(c.content)
    .map((seg) => (seg.type === 'token' ? resolve(seg.value) : seg.value))
    .join('');

  return (
    <Text style={baseStyle}>
      {/* Preserve user-authored hard newlines. react-pdf collapses blank lines
          without this approach; we substitute a non-breaking space for empty
          segments so the user sees the empty line. */}
      {merged.split('\n').map((line, i, arr) => (
        <Text key={i}>
          {line.length === 0 ? '\u00A0' : line}
          {i < arr.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </Text>
  );
}

/* ---------- images -------------------------------------------------------- */

function ImageBody({
  c,
  imageCache,
  resolve,
}: {
  c: Extract<RenderComponent, { kind: 'image' }>;
  imageCache: Map<string, Buffer | null>;
  resolve: Resolver;
}): React.ReactElement | null {
  const rawSrc = c.field && c.field.trim() ? resolve(c.field.trim()) : c.src;
  if (!rawSrc) return null;
  const img = imageDataFromRaw(rawSrc, imageCache);
  if (!img) return null;

  // react-pdf's <Image> sizes itself to its intrinsic dimensions unless
  // `style` overrides. Honor the design-time objectFit by stretching.
  return (
    <PdfImage
      src={img.data}
      style={{
        width: `${p(c.width)}pt`,
        height: `${p(c.height)}pt`,
        borderRadius: c.radius ? `${p(c.radius)}pt` : undefined,
        objectFit: c.objectFit ?? 'cover',
      }}
    />
  );
}

/* ---------- shapes -------------------------------------------------------- */

/**
 * Render shapes via SVG so we can match the live SVG used by ComponentBody.
 * `border-radius` on `<View>` doesn't follow real rounded-rect math — only
 * an elliptical cut. Use SVG <Path> arc commands for true rounded rectangles.
 */
function ShapeBody({
  c,
}: {
  c: Extract<RenderComponent, { kind: 'shape' }>;
}): React.ReactElement {
  const w = p(c.width);
  const h = p(c.height);
  const r = p(c.radius);
  const sw = p(c.strokeWidth);

  if (c.shape === 'line') {
    return (
      <Svg width={`${w}pt`} height={`${h}pt`} viewBox={`0 0 ${w} ${h}`}>
        <Path
          d={`M 0 ${h / 2} L ${w} ${h / 2}`}
          stroke={c.stroke}
          strokeWidth={sw}
        />
      </Svg>
    );
  }

  const fill = !isTransparent(c.fill) ? c.fill : 'none';
  const stroke = !isTransparent(c.stroke) ? c.stroke : 'none';

  if (c.shape === 'ellipse') {
    const rx = Math.max(0, (w - sw) / 2);
    const ry = Math.max(0, (h - sw) / 2);
    return (
      <Svg width={`${w}pt`} height={`${h}pt`} viewBox={`0 0 ${w} ${h}`}>
        <Path
          d={`M ${w / 2} ${sw / 2} A ${rx} ${ry} 0 1 0 ${w / 2} ${h - sw / 2} A ${rx} ${ry} 0 1 0 ${w / 2} ${sw / 2} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      </Svg>
    );
  }

  const path = roundedRectPath(w, h, r, sw);
  return (
    <Svg width={`${w}pt`} height={`${h}pt`} viewBox={`0 0 ${w} ${h}`}>
      <Path d={path} fill={fill} stroke={stroke} strokeWidth={sw} />
    </Svg>
  );
}
function roundedRectPath(w: number, h: number, r: number, sw: number): string {
  // Offset path inward by half stroke so outer edge aligns with design radius
  const offset = sw / 2;
  const innerW = Math.max(0, w - offset * 2);
  const innerH = Math.max(0, h - offset * 2);
  const k = Math.min(Math.max(0, r - offset), innerW / 2, innerH / 2);

  return [
    `M ${offset + k} ${offset}`,
    `H ${offset + innerW - k}`,
    `Q ${offset + innerW} ${offset} ${offset + innerW} ${offset + k}`,
    `V ${offset + innerH - k}`,
    `Q ${offset + innerW} ${offset + innerH} ${offset + innerW - k} ${offset + innerH}`,
    `H ${offset + k}`,
    `Q ${offset} ${offset + innerH} ${offset} ${offset + innerH - k}`,
    `V ${offset + k}`,
    `Q ${offset} ${offset} ${offset + k} ${offset}`,
    'Z',
  ].join(' ');
}

/* ---------- tables -------------------------------------------------------- */

function TableBody({
  c,
  resolve,
}: {
  c: Extract<RenderComponent, { kind: 'table' }>;
  resolve: Resolver;
}): React.ReactElement {
  const colW =
    c.colWidths && c.colWidths.length === c.cols
      ? c.colWidths
      : Array.from({ length: c.cols }, () => 1 / Math.max(1, c.cols));
  const fontFamilyName = fontFamily(
    c.fontWeight === 'semibold' || c.fontWeight === 'bold',
  );
  const baseWeight = fontWeightFor(c.fontWeight);

  return (
    <View
      style={{
        width: `${p(c.width)}pt`,
        height: `${p(c.height)}pt`,
        flexDirection: 'column',
      }}
    >
      {Array.from({ length: c.rows }).map((_, r) => {
        const isHeader =
          r === 0 && c.headerFill && !isTransparent(c.headerFill);
        const isOdd = r % 2 === 1;
        const rowFill = isHeader
          ? c.headerFill
          : c.zebra && isOdd
            ? c.zebraColor
            : undefined;
        return (
          <View
            key={r}
            style={{
              flexDirection: 'row',
              height: `${p(c.rowHeight)}pt`,
              backgroundColor: rowFill,
            }}
          >
            {Array.from({ length: c.cols }).map((__, ci) => {
              const cellText = (c.cells ?? [])[r * c.cols + ci] ?? '';
              const merged = splitContent(cellText)
                .map((seg) =>
                  seg.type === 'token' ? resolve(seg.value) : seg.value,
                )
                .join('');
              const borderStyle =
                c.border === 'none'
                  ? undefined
                  : c.border === 'grid'
                    ? '1pt solid #d6d3d1'
                    : isOutlineBorder(r, ci, c.rows, c.cols)
                      ? '1pt solid #d6d3d1'
                      : undefined;
              return (
                <View
                  key={ci}
                  style={{
                    width: `${colW[ci] * 100}%`,
                    height: `${p(c.rowHeight)}pt`,
                    padding: 4,
                    border: borderStyle,
                    justifyContent: 'flex-start',
                    alignItems:
                      c.align === 'center'
                        ? 'center'
                        : c.align === 'right'
                          ? 'flex-end'
                          : 'flex-start',
                  }}
                >
                  <Text
                    style={{
                      width: '100%',
                      fontFamily: fontFamilyName,
                      fontSize: `${p(c.fontSize)}pt`,
                      color: c.color,
                      fontWeight: baseWeight,
                      textAlign: c.align as any,
                    }}
                  >
                    {merged}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function isOutlineBorder(
  r: number,
  c: number,
  rows: number,
  cols: number,
): boolean {
  return r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
}

/* ---------- per-component render ----------------------------------------- */

function renderComponent(
  comp: RenderComponent,
  resolve: Resolver,
  imageCache: Map<string, Buffer | null>,
): React.ReactElement | null {
  if (comp.kind === 'text') return <TextBody c={comp} resolve={resolve} />;
  if (comp.kind === 'image')
    return <ImageBody c={comp} imageCache={imageCache} resolve={resolve} />;
  if (comp.kind === 'shape') return <ShapeBody c={comp} />;
  return <TableBody c={comp} resolve={resolve} />;
}

/* ---------- page tiling --------------------------------------------------- */

function inPage(
  it: StackedLayoutItem,
  comp: RenderComponent,
  px: number,
  py: number,
  size: RenderTemplate['canvas']['size'],
): boolean {
  const pageLeft = px * size.width;
  const pageRight = (px + 1) * size.width;
  const pageTop = py * size.height;
  const pageBottom = (py + 1) * size.height;
  return (
    it.x < pageRight &&
    it.x + comp.width > pageLeft &&
    it.y < pageBottom &&
    it.y + comp.height > pageTop
  );
}

/* ---------- entry point --------------------------------------------------- */

export async function renderTemplatePdf(
  template: RenderTemplate,
  values: FillValues,
  resolveImage: ImageResolver,
): Promise<Buffer> {
  ensureFontsRegistered();

  const components = template.canvas.components ?? [];
  // SVG text uses font data directly, before the ordinary text asset pass.
  const importFonts = new Map<string, { fontFamily: string; fontWeight: number; fontStyle: any }>();
  for (const component of components) {
    if (component.kind !== 'text' || !Number.isFinite(component.fontAscent)) continue;
    for (const mark of [component, ...(component.marks ?? [])]) {
      const weight = mark.fontWeight ?? component.fontWeight;
      const descriptor = { fontFamily: importedFontFamily(component.fontFamily) ?? fontFamily(weight === 'bold'),
        fontWeight: fontWeightFor(weight), fontStyle: mark.fontStyle ?? component.fontStyle };
      importFonts.set(JSON.stringify(descriptor), descriptor);
    }
  }
  await Promise.all([...importFonts.values()].map(descriptor => Font.load(descriptor)));
  const groups = template.groups ?? [];
  const size = template.canvas.size;

  const byId = new Map(components.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const counts: Record<string, number> = {};
  for (const g of groups) {
    const arr = values[g.name];
    counts[g.id] = Array.isArray(arr) ? Math.max(1, arr.length) : 1;
  }

  const items: StackedLayoutItem[] = layoutStacked({
    components,
    groups,
    counts,
    canvasSize: size,
  });

  // Pre-resolve every image source — react-pdf's <Image> needs a Buffer inline,
  // and the component tree is built synchronously below.
  const imageCache = new Map<string, Buffer | null>();
  for (const it of items) {
    const comp = byId.get(it.id);
    if (comp?.kind !== 'image') continue;
    const resolver = makeResolver(
      values,
      groupById,
      it.groupId,
      it.instanceIndex,
      template.fields,
    );
    const rawSrc =
      comp.field && comp.field.trim() ? resolver(comp.field.trim()) : comp.src;
    if (!rawSrc || rawSrc.startsWith('data:')) continue;
    const buf = await resolveImage(rawSrc);
    imageCache.set(rawSrc, buf);
  }

  let bw = size.width;
  let bh = size.height;
  for (const it of items) {
    const comp = byId.get(it.id);
    if (comp) {
      bw = Math.max(bw, it.x + comp.width);
      bh = Math.max(bh, it.y + comp.height);
    }
  }
  const pagesW = Math.max(1, Math.ceil(bw / size.width));
  const pagesH = Math.max(1, Math.ceil(bh / size.height));

  const styles = StyleSheet.create({
    page: {
      padding: 0,
      margin: 0,
      position: 'relative',
    },
    abs: {
      position: 'absolute',
    },
  });

  // Build the document tree. Every Page is one canvas-sized tile; we shift
  // the laid-out coordinates back into per-page local space so the PDF page
  // box matches the canvas size exactly.
  //
  // Each per-page item is wrapped in an absolutely-positioned `View` whose
  // `top`/`left` are explicit `pt` strings (react-pdf treats `*` values as
  // points; numeric values also work but string units are unambiguous).
  const document = React.createElement(
    Document as any,
    null,
    Array.from({ length: pagesH }).flatMap((_, py) =>
      Array.from({ length: pagesW }).map((__, px) => {
        const inThisPage = items.flatMap((it) => {
          const comp = byId.get(it.id);
          if (!comp || !inPage(it, comp, px, py, size)) return [];
          const resolver = makeResolver(
            values,
            groupById,
            it.groupId,
            it.instanceIndex,
            template.fields,
          );
          const node = renderComponent(comp, resolver, imageCache);
          if (!node) return [];
          const shiftedX = (it.x - px * size.width) * PT;
          const shiftedY = (it.y - py * size.height) * PT;
          const w = comp.width * PT;
          let h = comp.height * PT;
          if (comp.kind === 'text') {
            const lineCount = (comp.content.match(/\n/g) || []).length + 1;
            const calculatedHeight =
              comp.fontSize * comp.lineHeight * lineCount;
            h = Math.max(comp.height, calculatedHeight) * PT;
          }
          return [
            React.createElement(
              View as any,
              {
                key: `${it.id}_${px}_${py}`,
                style: {
                  position: 'absolute',
                  left: `${shiftedX}pt`,
                  top: `${shiftedY}pt`,
                  width: `${w}pt`,
                  height: `${h}pt`,
                  transform: comp.rotation
                    ? `rotate(${comp.rotation}deg)`
                    : undefined,
                },
              },
              node,
            ),
          ];
        });
        return React.createElement(
          Page as any,
          {
            key: `${px}_${py}`,
            size: [p(size.width), p(size.height)],
            style: styles.page,
          },
          inThisPage,
        );
      }),
    ),
  );

  return renderToBuffer(document as any);
}
