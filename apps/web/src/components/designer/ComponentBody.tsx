import { canvasFontFamily } from './fonts';
import { importedTextFragments } from './importedText';
import { splitContent } from './textMerge';
import type { CanvasComponent, FontWeight, FontStyle, TextDecoration, TextMark } from './types';

export const WEIGHT: Record<FontWeight, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/** Returns the effective font size at `pos` (base overridden by every
 * overlapping mark). Marks are clamped to `[0, base.length]` and
 * zero-length/empty marks are dropped. */
function sizeAt(marks: TextMark[] | undefined, pos: number, base: number): number {
  if (!marks) return base;
  let s = base;
  for (const m of marks) {
    if (m.start <= pos && pos < m.end && typeof m.fontSize === 'number') s = m.fontSize;
  }
  return s;
}

function weightAt(marks: TextMark[] | undefined, pos: number, base: FontWeight): FontWeight {
  if (!marks) return base;
  let w: FontWeight = base;
  for (const m of marks) {
    if (m.start <= pos && pos < m.end && m.fontWeight) w = m.fontWeight;
  }
  return w;
}

function fontStyleAt(marks: TextMark[] | undefined, pos: number, base: FontStyle): FontStyle {
  if (!marks) return base;
  let s: FontStyle = base;
  for (const m of marks) {
    if (m.start <= pos && pos < m.end && m.fontStyle) s = m.fontStyle;
  }
  return s;
}

function textDecorationAt(marks: TextMark[] | undefined, pos: number, base: TextDecoration): TextDecoration {
  if (!marks) return base;
  let t: TextDecoration = base;
  for (const m of marks) {
    if (m.start <= pos && pos < m.end && m.textDecoration) t = m.textDecoration;
  }
  return t;
}

function colorAt(marks: TextMark[] | undefined, pos: number, base: string): string {
  if (!marks) return base;
  let c = base;
  for (const m of marks) {
    if (m.start <= pos && pos < m.end && m.color) c = m.color;
  }
  return c;
}

/** Group consecutive characters that share the same effective (size, weight,
 * style, decoration) into styled `<span>`s, and split each at `{{token}}`
 * boundaries so tokens still render as chips / resolved values. */
function renderTextWithMarks(
  content: string,
  marks: TextMark[] | undefined,
  baseSize: number,
  baseWeight: FontWeight,
  baseStyle: FontStyle,
  baseDecoration: TextDecoration,
  baseColor: string,
  resolve: ((token: string) => string) | undefined,
  svg = false,
) {
  // Build a per-character "effective style" so we can group adjacent same-style
  // chars into a single span, then re-cut at token boundaries.
  const chars: { ch: string; size: number; weight: FontWeight; fontStyle: FontStyle; textDecoration: TextDecoration; color: string; inToken: boolean; tokenName?: string }[] = [];
  for (const seg of splitContent(content)) {
    if (seg.type === 'token') {
      // Each char of a token gets the base style (marks don't apply to chips).
      for (const ch of seg.value) chars.push({ ch, size: baseSize, weight: baseWeight, fontStyle: baseStyle, textDecoration: baseDecoration, color: baseColor, inToken: true, tokenName: seg.value });
    } else {
      for (let i = 0; i < seg.value.length; i++) {
        const pos = chars.length; // current char index in `content`
        chars.push({ ch: seg.value[i], size: sizeAt(marks, pos, baseSize), weight: weightAt(marks, pos, baseWeight), fontStyle: fontStyleAt(marks, pos, baseStyle), textDecoration: textDecorationAt(marks, pos, baseDecoration), color: colorAt(marks, pos, baseColor), inToken: false });
      }
    }
  }

  // Group: walk chars, start a new run whenever style changes or we hit a
  // token boundary.
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < chars.length) {
    const start = i;
    const style = { size: chars[i].size, weight: chars[i].weight, fontStyle: chars[i].fontStyle, textDecoration: chars[i].textDecoration, color: chars[i].color };
    // If this char is part of a token, collect the whole token as one run.
    if (chars[i].inToken) {
      const tokenName = chars[i].tokenName!;
      while (i < chars.length && chars[i].inToken && chars[i].tokenName === tokenName) i++;
      if (resolve) {
        const v = resolve(tokenName);
        if (v) {
          out.push(<span key={key++}>{v}</span>);
        } else {
          out.push(<span key={key++} className="italic text-stone-300 dark:text-stone-600">{`{{${tokenName}}}`}</span>);
        }
      } else {
        out.push(
          <span key={key++} className="rounded bg-orange-100 px-1 text-orange-800 dark:bg-orange-950 dark:text-orange-200">
            {`{{${tokenName}}}`}
          </span>,
        );
      }
      continue;
    }
    // Plain run: extend while same style.
    while (i < chars.length && !chars[i].inToken && chars[i].size === style.size && chars[i].weight === style.weight && chars[i].fontStyle === style.fontStyle && chars[i].textDecoration === style.textDecoration && chars[i].color === style.color) i++;
    const text = chars.slice(start, i).map((c) => c.ch).join('');
    if (svg) out.push(
      <tspan key={key++} style={{ fontSize: style.size, fontWeight: WEIGHT[style.weight], fontStyle: style.fontStyle, textDecoration: style.textDecoration, fill: style.color }}>{text}</tspan>,
    );
    else out.push(
      <span key={key++} style={{ fontSize: style.size, fontWeight: WEIGHT[style.weight], fontStyle: style.fontStyle, textDecoration: style.textDecoration, color: style.color }}>
        {text}
      </span>,
    );
  }
  return out;
}

export interface ComponentBodyProps {
  component: CanvasComponent;
  /**
   * Token resolver for *filled* rendering. When omitted, the body renders in
   * design mode: `{{token}}` placeholders appear as distinct orange chips and
   * named image slots show their placeholder. When provided, each token is
   * replaced by its resolved value (blank if unresolved) and image slots show
   * their resolved `src`.
   */
  resolve?: (token: string) => string;
  /** Internal: preserve the source width of unchanged substituted text. */
  fitToWidth?: boolean;
}

/**
 * Renders the inner content of a canvas component (text / image / shape).
 * Shared by the designer (design mode, no `resolve`) and the filler preview
 * (filled mode, with `resolve`) so the two never drift apart.
 */
export function ComponentBody({ component, resolve, fitToWidth }: ComponentBodyProps) {
  if (component.kind === 'text') {
    const fragments = importedTextFragments(component);
    if (fragments) {
      return (
        <div className="relative h-full w-full">
          {fragments.map((fragment, i) => (
            <div key={i} style={{
              position: 'absolute', left: fragment.x, top: 0,
              width: fragment.width, height: component.height,
            }}>
              <ComponentBody resolve={resolve} fitToWidth={fragment.fitWidth === true} component={{
                ...component,
                importedText: undefined,
                content: component.content.slice(fragment.start, fragment.end),
                width: fragment.width,
                fontAscent: fragment.baseline / component.fontSize,
                marks: component.marks
                  ?.filter((m) => m.end > fragment.start && m.start < fragment.end)
                  .map((m) => ({
                    ...m,
                    start: Math.max(m.start, fragment.start) - fragment.start,
                    end: Math.min(m.end, fragment.end) - fragment.start,
                  })),
              }} />
            </div>
          ))}
        </div>
      );
    }
    if (!component.importedText && Number.isFinite(component.fontAscent) && !component.content.includes('\n') && !component.content.includes('{{')) {
      const x = component.align === 'center' ? component.width / 2 : component.align === 'right' ? component.width : 0;
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${component.width} ${component.height}`} style={{ overflow: 'visible' }}>
          <text x={x} y={component.fontAscent! * component.fontSize}
            textLength={fitToWidth ? component.width : undefined}
            lengthAdjust={fitToWidth ? 'spacingAndGlyphs' : undefined}
            textAnchor={component.align === 'center' ? 'middle' : component.align === 'right' ? 'end' : 'start'}
            style={{ fontFamily: canvasFontFamily(component.fontFamily), fontSize: component.fontSize,
              fontWeight: WEIGHT[component.fontWeight], fontStyle: component.fontStyle, fill: component.color,
              textDecoration: component.textDecoration, whiteSpace: 'pre' }}>
            {renderTextWithMarks(component.content, component.marks, component.fontSize, component.fontWeight,
              component.fontStyle, component.textDecoration, component.color, resolve, true)}
          </text>
        </svg>
      );
    }
    return (
      <div
        className="h-full w-full overflow-hidden whitespace-pre-wrap break-words"
        style={{
          // Lato is embedded in the backend PDF renderer too, so the on-screen
          // preview matches the exported PDF (including Turkish glyphs).
          fontFamily: canvasFontFamily(component.fontFamily),
          fontSize: component.fontSize,
          lineHeight: component.lineHeight,
          color: component.color,
          fontWeight: WEIGHT[component.fontWeight],
          fontStyle: component.fontStyle,
          textDecoration: component.textDecoration,
          textAlign: component.align,
        }}
      >
        {renderTextWithMarks(component.content, component.marks, component.fontSize, component.fontWeight, component.fontStyle, component.textDecoration, component.color, resolve)}
      </div>
    );
  }

  if (component.kind === 'image') {
    const src = resolve && component.field.trim() ? resolve(component.field.trim()) : component.src;
    return (
      <div className="relative h-full w-full">
        {src ? (
          <img
            src={src}
            alt={component.alt}
            className="h-full w-full"
            style={{ objectFit: component.objectFit, borderRadius: component.radius }}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400">
            {component.field.trim() ? `{{${component.field}}}` : 'Image'}
          </div>
        )}
        {!resolve && component.field.trim() && component.src && (
          <span className="pointer-events-none absolute left-1 top-1 rounded bg-orange-600/90 px-1 py-0.5 text-[10px] font-medium text-white shadow">
            {`{{${component.field}}}`}
          </span>
        )}
      </div>
    );
  }

  // table
  if (component.kind === 'table') {
    const { rows, cols, cells, colWidths, rowHeight, border, zebra, zebraColor, headerFill, fontSize, fontWeight, color, align } = component;
    const WEIGHT: Record<FontWeight, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
    const colW = colWidths ? colWidths.map((w) => `${w * 100}%`) : Array.from({ length: cols }, () => `${100 / cols}%`);

    // Helper to render a cell's content with token chips
    const renderCellContent = (cellText: string) => {
      if (!cellText) return null;
      return splitContent(cellText).map((seg, i) => {
        if (seg.type === 'token') {
          if (resolve) {
            const v = resolve(seg.value);
            return v ? <span key={i}>{v}</span> : <span key={i} className="italic text-stone-300 dark:text-stone-600">{`{{${seg.value}}}`}</span>;
          }
          return (
            <span key={i} className="rounded bg-orange-100 px-1 text-orange-800 dark:bg-orange-950 dark:text-orange-200">
              {`{{${seg.value}}}`}
            </span>
          );
        }
        return <span key={i}>{seg.value}</span>;
      });
    };

    return (
      <div className="h-full w-full overflow-auto">
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize, color, fontWeight: WEIGHT[fontWeight] }}>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => {
              const isHeader = r === 0 && headerFill;
              const isOdd = r % 2 === 1;
              const rowBg = isHeader ? headerFill : zebra && isOdd ? zebraColor : '';
              return (
                <tr key={r} style={{ height: rowHeight, background: rowBg || undefined }}>
                  {Array.from({ length: cols }).map((_, c) => {
                    const cellIdx = r * cols + c;
                    const cellText = cells[cellIdx] ?? '';
                    const borderStyle = border === 'none' ? 'none' : border === 'outline'
                      ? (r === 0 ? 'border-top' : '') + (r === rows - 1 ? 'border-bottom' : '') + (c === 0 ? 'border-left' : '') + (c === cols - 1 ? 'border-right' : '')
                      : '1px solid #d6d3d1';
                    return (
                      <td key={c} style={{ width: colW[c], border: borderStyle, padding: '4px 6px', textAlign: align }}>
                        {renderCellContent(cellText)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // SVG retains fractional stroke widths and matches PDF stroke geometry.
  const sw = Math.max(0, component.strokeWidth);
  const inset = sw / 2;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${component.width} ${component.height}`} preserveAspectRatio="none">
      {component.shape === 'line' ? (
        <line x1={0} y1={component.height / 2} x2={component.width} y2={component.height / 2} stroke={component.stroke} strokeWidth={sw} />
      ) : component.shape === 'ellipse' ? (
        <ellipse cx={component.width / 2} cy={component.height / 2}
          rx={Math.max(0, component.width / 2 - inset)} ry={Math.max(0, component.height / 2 - inset)}
          fill={component.fill || 'none'} stroke={component.stroke || 'none'} strokeWidth={sw} />
      ) : (
        <rect x={inset} y={inset} width={Math.max(0, component.width - sw)} height={Math.max(0, component.height - sw)}
          rx={Math.max(0, component.radius - inset)} fill={component.fill || 'none'} stroke={component.stroke || 'none'} strokeWidth={sw} />
      )}
    </svg>
  );
}
