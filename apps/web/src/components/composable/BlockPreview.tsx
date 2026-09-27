/**
 * Read-only DOM preview of composable blocks. Approximates the PDF output
 * (typography scale, tones, tables) — the authoritative render stays
 * backend-side (`flow-pdf.tsx`).
 */
import type { DocBlock } from '../../context/TemplateStoreProvider';
import {
  DEFAULT_PREVIEW_THEME,
  componentStyleFor,
  fontSizeMultiplier,
  type ComponentDefaults,
  type PreviewTheme,
} from './blockCatalog';
import { cn } from '../../lib/cn';

const TONE_BG: Record<string, string> = {
  info: '#e0f2fe',
  success: '#dcfce7',
  warning: '#fef9c3',
  danger: '#fee2e2',
};

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

function PreviewBlock({
  block,
  theme,
  componentDefaults,
}: {
  block: DocBlock;
  theme: PreviewTheme;
  componentDefaults?: ComponentDefaults;
}) {
  const inputs = block.inputs ?? {};
  const style = componentStyleFor(componentDefaults, block.type);
  const size = (base: number): number =>
    base * fontSizeMultiplier(style.fontSize);
  const body = {
    color: style.color ?? theme.colors.body,
    fontSize: size(theme.baseFontSize),
  };

  switch (block.type) {
    case 'heading': {
      const level = typeof inputs.level === 'number' ? inputs.level : 1;
      const scale = [2, 1.5, 1.25, 1.1][Math.min(Math.max(level, 1), 4) - 1];
      return (
        <div
          style={{
            fontSize: size(theme.baseFontSize * scale),
            fontWeight: level <= 2 ? 700 : 400,
            color: style.color ?? theme.colors.heading,
            textAlign: (inputs.align as 'left' | 'center' | 'right') ?? 'left',
          }}
        >
          {str(inputs.text) || <span className="opacity-40">Heading</span>}
        </div>
      );
    }
    case 'paragraph':
      return (
        <div style={{ ...body, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {str(inputs.text) || <span className="opacity-40">Paragraph</span>}
        </div>
      );
    case 'bullet-list':
    case 'numbered-list': {
      const items = Array.isArray(inputs.items)
        ? (inputs.items as string[])
        : [];
      const ordered = block.type === 'numbered-list';
      const start = typeof inputs.start === 'number' ? inputs.start : 1;
      const List = ordered ? 'ol' : 'ul';
      return (
        <List
          style={{
            ...body,
            lineHeight: 1.5,
            paddingLeft: 18,
            listStyleType: ordered
              ? 'decimal'
              : str(inputs.style, 'disc') === 'dash'
                ? '"– "'
                : str(inputs.style, 'disc'),
          }}
          className={ordered ? 'list-decimal' : 'list-disc'}
          start={ordered ? start : undefined}
        >
          {items.length === 0 && <li className="opacity-40">Item</li>}
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </List>
      );
    }
    case 'image': {
      const src = str(inputs.src);
      const width =
        inputs.width === 'half'
          ? '50%'
          : inputs.width === 'third'
            ? '33%'
            : '100%';
      return (
        <figure className="m-0">
          {src ? (
            <img
              src={src}
              alt={str(inputs.alt)}
              style={{ width }}
              className="rounded"
            />
          ) : (
            <div className="flex h-24 items-center justify-center rounded border border-dashed border-stone-300 text-xs text-stone-400">
              No image URL yet
            </div>
          )}
          {inputs.caption ? (
            <figcaption
              style={{
                fontSize: theme.baseFontSize * 0.85,
                color: theme.colors.muted,
              }}
            >
              {str(inputs.caption)}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case 'table': {
      const columns = Array.isArray(inputs.columns)
        ? (inputs.columns as {
            label: string;
            align?: 'left' | 'center' | 'right';
          }[])
        : [];
      const rows = Array.isArray(inputs.rows)
        ? (inputs.rows as { cells: string[] }[])
        : [];
      const header = inputs.header !== false;
      return (
        <table className="w-full border-collapse text-left" style={body}>
          {header && (
            <thead>
              <tr style={{ backgroundColor: `${theme.colors.primary}22` }}>
                {columns.map((column, i) => (
                  <th
                    key={i}
                    style={{ textAlign: column.align }}
                    className="border-b border-stone-200 p-1 font-bold"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={
                  inputs.zebra && ri % 2 === 1 ? 'bg-stone-50' : undefined
                }
              >
                {columns.map((column, i) => (
                  <td
                    key={i}
                    style={{ textAlign: column.align }}
                    className="border-b border-stone-100 p-1"
                  >
                    {row.cells[i] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'quote':
      return (
        <blockquote
          className="m-0"
          style={{
            borderLeft: `3px solid ${theme.colors.primary}`,
            paddingLeft: 10,
          }}
        >
          <div
            style={{
              ...body,
              fontSize: size(theme.baseFontSize * 1.1),
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            {str(inputs.text) || <span className="opacity-40">Quote</span>}
          </div>
          {inputs.author ? (
            <div
              style={{
                fontSize: theme.baseFontSize * 0.85,
                color: theme.colors.muted,
              }}
            >
              — {str(inputs.author)}
            </div>
          ) : null}
        </blockquote>
      );
    case 'callout': {
      const tone = str(inputs.tone || inputs.variant, 'info');
      return (
        <div
          className="rounded"
          style={{
            backgroundColor: style.background ?? TONE_BG[tone] ?? TONE_BG.info,
            padding: 10,
          }}
        >
          {inputs.title ? (
            <div
              style={{
                fontSize: size(theme.baseFontSize),
                fontWeight: 700,
                color: style.color ?? theme.colors.heading,
              }}
            >
              {str(inputs.title)}
            </div>
          ) : null}
          <div style={{ ...body, lineHeight: 1.5 }}>
            {str(inputs.body) || (
              <span className="opacity-40">Callout body</span>
            )}
          </div>
        </div>
      );
    }
    case 'code':
      return (
        <pre
          className="whitespace-pre-wrap break-words rounded p-2.5"
          style={{
            backgroundColor: style.background ?? '#1c1917',
            color: style.color ?? '#fafaf9',
            fontSize: size(theme.baseFontSize * 0.9),
          }}
        >
          {str(inputs.code) || <span className="opacity-40">code…</span>}
        </pre>
      );
    case 'divider':
      return <hr className="border-stone-300" />;
    case 'stat-grid': {
      const stats = Array.isArray(inputs.stats)
        ? (inputs.stats as { value: string; label: string }[])
        : [];
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${inputs.columns ?? Math.max(stats.length, 1)}, minmax(0, 1fr))`,
            gap: theme.spacing,
          }}
        >
          {stats.map((s, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: size(theme.baseFontSize * 1.6),
                  fontWeight: 700,
                  color: style.color ?? theme.colors.primary,
                }}
              >
                {s.value || <span className="opacity-40">—</span>}
              </div>
              <div
                style={{
                  fontSize: theme.baseFontSize * 0.85,
                  color: theme.colors.muted,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'section': {
      const kids = Array.isArray(inputs.blocks)
        ? (inputs.blocks as DocBlock[])
        : [];
      const horizontal = inputs.direction === 'horizontal';
      const justifyMap: Record<string, string> = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        between: 'space-between',
      };
      const alignMap: Record<string, string> = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        stretch: 'stretch',
      };
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: horizontal ? 'row' : 'column',
            justifyContent:
              justifyMap[inputs.justify as string] ?? 'flex-start',
            alignItems: alignMap[inputs.align as string] ?? 'stretch',
            gap: theme.spacing,
          }}
        >
          {kids.length === 0 && (
            <p className="text-[11px] text-stone-400">Section — empty</p>
          )}
          {kids.map((k) => (
            <div
              key={k.id}
              className="min-w-0"
              style={horizontal ? { flex: '1 1 0' } : undefined}
            >
              <PreviewBlock
                block={k}
                theme={theme}
                componentDefaults={componentDefaults}
              />
            </div>
          ))}
        </div>
      );
    }
    case 'columns': {
      const cols = Array.isArray(inputs.columns)
        ? (inputs.columns as DocBlock[][])
        : [];
      const ratio = Array.isArray(inputs.ratio)
        ? (inputs.ratio as number[])
        : [];
      return (
        <div className="flex" style={{ gap: theme.spacing }}>
          {cols.map((col, i) => (
            <div key={i} className="min-w-0" style={{ flex: ratio[i] ?? 1 }}>
              {(col ?? []).length === 0 && (
                <p className="text-[11px] text-stone-400">
                  Column {i + 1} — empty
                </p>
              )}
              <BlockPreview
                blocks={col ?? []}
                theme={theme}
                componentDefaults={componentDefaults}
                nested
              />
            </div>
          ))}
        </div>
      );
    }
    default:
      return (
        <p className="text-xs text-stone-400">
          Unsupported block “{block.type}”.
        </p>
      );
  }
}

export function BlockPreview({
  blocks,
  theme = DEFAULT_PREVIEW_THEME,
  componentDefaults,
  nested = false,
}: {
  blocks: DocBlock[];
  theme?: PreviewTheme;
  componentDefaults?: ComponentDefaults;
  nested?: boolean;
}) {
  if (blocks.length === 0 && !nested) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 p-8 text-center">
        <p className="text-sm font-medium text-stone-500">Empty document</p>
        <p className="max-w-xs text-xs text-stone-400">
          Add your first block from the library to start composing.
        </p>
      </div>
    );
  }
  return (
    <div
      className={cn('flex flex-col')}
      style={{ gap: theme.spacing, fontFamily: theme.fontFamily }}
    >
      {blocks.map((block) => (
        <div key={block.id}>
          {block.pageBreak && !nested && (
            <div className="mb-2 border-t-2 border-dashed border-orange-300 pt-1 text-[10px] font-medium tracking-wide text-orange-500">
              PAGE BREAK
            </div>
          )}
          <PreviewBlock
            block={block}
            theme={theme}
            componentDefaults={componentDefaults}
          />
        </div>
      ))}
    </div>
  );
}
