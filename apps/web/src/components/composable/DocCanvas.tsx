/**
 * Shared paged canvas for Composable Templates. Same panel chrome as the
 * fixed-layout fill preview (zoom actions, stacked white page tiles on a
 * stone scroll container), with flow blocks inside each page plus an optional
 * per-page header zone and footer zone (footer text + page numbers).
 *
 * Callers pre-paginate: fill mode splits on `pageBreak` flags, design mode
 * shows one sample component per page.
 */
import { useEffect, useRef, useState } from 'react';
import { IconMaximize, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import type { DocBlock } from '../../context/TemplateStoreProvider';
import { Panel } from '../ui';
import { BlockPreview } from './BlockPreview';
import {
  DEFAULT_PREVIEW_THEME,
  type ComponentDefaults,
  type PreviewTheme,
} from './blockCatalog';
import type {
  DocFormat,
  DocOrientation,
  DocPageSize,
} from './DocCanvasSettings';

import { docPageDims, docPagePadding } from './docPageLayout';

export interface DocCanvasProps {
  /** Panel title: "Canvas" (design) or "Preview" (fill). */
  panelTitle?: string;
  /** Document title — header fallback when header text is blank. */
  title: string;
  /** Template name — muted footer fallback. */
  templateName?: string;
  /** Pre-paginated block groups, one entry per page. */
  pages: DocBlock[][];
  theme?: PreviewTheme;
  componentDefaults?: ComponentDefaults;
  pageSize?: DocPageSize;
  orientation?: DocOrientation;
  header?: { enabled: boolean; text?: string };
  footer?: { enabled: boolean; text?: string };
  pageNumbers?: boolean;
  pageNumberFormat?: string;
  showTitle?: boolean;
  format?: DocFormat;
  className?: string;
}

export function DocCanvas({
  panelTitle = 'Canvas',
  title,
  pages,
  theme = DEFAULT_PREVIEW_THEME,
  componentDefaults,
  pageSize = 'A4',
  orientation = 'portrait',
  header,
  footer,
  pageNumbers = true,
  pageNumberFormat = 'Page {page} / {total}',
  showTitle = false,
  format = 'document',
  className,
}: DocCanvasProps) {
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = viewport.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setAvailable({ width: node.clientWidth, height: node.clientHeight });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const size = docPageDims(pageSize, orientation);
  const fitZoom = available.width && available.height
    ? Math.max(0.1, Math.min(1, (available.width - 48) / size.width, (available.height - 48) / size.height)) : 0.6;
  const zoom = manualZoom ?? fitZoom;
  const padding = docPagePadding(theme.pagePadding);
  const safePages = pages.length > 0 ? pages : [[]];
  const pageCount = safePages.length;
  const headerText = (header?.text ?? title).trim();
  const footerText = (footer?.text ?? '').trim();
  const showFooter = !!footer?.enabled || pageNumbers;

  return (
    <Panel
      title={panelTitle}
      subtitle={pageCount > 1 ? `Live · ${pageCount} pages` : 'Live'}
      bodyClassName="overflow-hidden p-0"
      className={className ?? 'min-h-0'}
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              setManualZoom(Math.max(0.1, Number((zoom - 0.1).toFixed(2))))
            }
            className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
            aria-label="Zoom out"
          >
            <IconZoomOut size={16} />
          </button>
          <span className="min-w-[3rem] text-center text-xs font-medium text-stone-600 dark:text-stone-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() =>
              setManualZoom(Math.min(1.5, Number((zoom + 0.1).toFixed(2))))
            }
            className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
            aria-label="Zoom in"
          >
            <IconZoomIn size={16} />
          </button>
          <button type="button" aria-label="Fit page" title="Fit page" onClick={() => setManualZoom(null)}
            className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700">
            <IconMaximize size={16} />
          </button>
        </>
      }
    >
      <div ref={viewport} data-testid="document-viewport" className="h-full min-h-80 w-full overflow-auto bg-stone-100 p-6 xl:min-h-0 dark:bg-stone-900/60">
        <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4">
          {safePages.map((pageBlocks, pi) => (
            <div
              key={pi}
              className="relative shrink-0 overflow-hidden bg-white shadow-lg ring-1 ring-stone-300 dark:bg-stone-100 dark:ring-stone-700"
              style={{ width: size.width * zoom, height: size.height * zoom }}
            >
              <div
                className="absolute left-0 top-0 flex origin-top-left flex-col"
                style={{
                  width: size.width,
                  height: size.height,
                  transform: `scale(${zoom})`,
                  fontFamily: theme.fontFamily,
                }}
              >
                {header?.enabled && (
                  <div className="absolute flex items-center border-b border-stone-200 pb-1.5"
                    style={{ left: padding, right: padding, top: Math.max(12, padding - 20) }}>
                    <span
                      className="truncate font-bold"
                      style={{
                        color: theme.colors.heading,
                        fontSize: theme.baseFontSize * 1.1,
                      }}
                    >
                      {headerText}
                    </span>
                  </div>
                )}
                <div
                  className="absolute overflow-auto"
                  aria-label={`${format === 'slides' ? 'Slide' : 'Page'} ${pi + 1} content`}
                  style={{
                    left: padding,
                    right: padding,
                    top: padding + (header?.enabled ? 28 : 0),
                    bottom: padding + (showFooter ? 24 : 0),
                  }}
                >
                  {showTitle && pi === 0 && (
                    <div
                      style={{
                        fontSize: theme.baseFontSize * 2.2,
                        fontWeight: 700,
                        color: theme.colors.heading,
                        marginBottom: theme.spacing * 2,
                      }}
                    >
                      {title}
                    </div>
                  )}
                  {pageBlocks.length === 0 ? (
                    <BlockPreview
                      blocks={pageBlocks}
                      theme={theme}
                      componentDefaults={componentDefaults}
                    />
                  ) : (
                    <BlockPreview
                      blocks={pageBlocks}
                      theme={theme}
                      componentDefaults={componentDefaults}
                      nested
                    />
                  )}
                </div>
                {showFooter && (
                  <div className="absolute flex items-center justify-between gap-3 border-t border-stone-200 pt-1.5"
                    style={{ left: padding, right: padding, bottom: Math.max(12, padding - 24) }}>
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{
                        color: theme.colors.muted,
                        fontSize: theme.baseFontSize * 0.85,
                      }}
                    >
                      {footer?.enabled ? footerText : ''}
                    </span>
                    {pageNumbers && (
                      <span
                        className="shrink-0 tabular-nums"
                        style={{
                          color: theme.colors.muted,
                          fontSize: theme.baseFontSize * 0.85,
                        }}
                      >
                        {pageNumberFormat
                          .replace('{page}', String(pi + 1))
                          .replace('{total}', String(pageCount))}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
