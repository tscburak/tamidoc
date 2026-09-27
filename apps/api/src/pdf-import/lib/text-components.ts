import type { TextRun, ImportTextMark } from './pdf-parser';
import { groupRunsIntoParagraphs } from './group-paragraphs';
import type { TableDividers } from './table-structure';
import type { ImportedTextLayout } from '../../pdf-render/lib/types';

type Mark = ImportTextMark & {
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  fontSize?: number;
};

/** Make paragraphs editable as a whole while retaining source glyph positions.
 * Keep columns, pages, rotated labels and intervening artwork separate. */
export function textComponents(
  runs: TextRun[],
  options: { dividers?: TableDividers; paintBreaks?: number[] } = {},
) {
  const partitions = new Map<string, TextRun[]>();
  runs.forEach((run, i) => {
    const band = (options.paintBreaks ?? []).filter(
      (order) => order < (run.paintOrder ?? Number.MAX_SAFE_INTEGER),
    ).length;
    const key =
      Math.abs(run.rotation ?? 0) > 0.01
        ? `rotated_${i}`
        : `${run.page}:${run.fontFamily}:${band}`;
    const list = partitions.get(key) ?? [];
    list.push(run);
    partitions.set(key, list);
  });

  return [...partitions.values()].flatMap((partition) =>
    groupRunsIntoParagraphs(partition, options).map((paragraph) => {
      const source = paragraph.lines.flatMap((line) => line.sourceRuns ?? []);
      const first = source[0];
      let content = '';
      const marks: Mark[] = [];
      const fragments: ImportedTextLayout['fragments'] = [];
      for (const [lineIndex, line] of paragraph.lines.entries()) {
        if (lineIndex) content += paragraph.hardBreaks ? '\n' : ' ';
        const lineRuns = line.sourceRuns ?? [];
        for (const [i, run] of lineRuns.entries()) {
          const prev = lineRuns[i - 1];
          if (
            prev &&
            run.x - (prev.x + prev.width) > run.fontSizePx * 0.1 &&
            !/\s$/.test(content) &&
            !/^\s/.test(run.text)
          )
            content += ' ';
          const start = content.length;
          content += run.text;
          const mark: Mark = { start, end: content.length };
          if (run.fontWeight !== first.fontWeight)
            mark.fontWeight = run.fontWeight;
          if (run.fontStyle !== first.fontStyle) mark.fontStyle = run.fontStyle;
          if (run.fontSizePx !== first.fontSizePx)
            mark.fontSize = run.fontSizePx;
          if (run.color !== first.color) mark.color = run.color;
          if (Object.keys(mark).length > 2) marks.push(mark);
          for (const inline of run.marks ?? [])
            marks.push({
              ...inline,
              start: start + inline.start,
              end: start + inline.end,
            });
          fragments.push({
            start,
            end: content.length,
            width: run.width,
            x: run.x - paragraph.x,
            baseline:
              Math.abs(run.rotation ?? 0) > 0.01
                ? run.fontSizePx * (run.fontAscent ?? 0.8)
                : run.baselineY - paragraph.y,
            ...(run.fontSubstituted ? { fitWidth: true } : {}),
          });
        }
      }
      const advance =
        paragraph.lines.length > 1
          ? (paragraph.lines.at(-1)!.baselineY - paragraph.lines[0].baselineY) /
            (paragraph.lines.length - 1)
          : first.height;
      const lineHeight = advance / first.fontSizePx;
      const importedText: ImportedTextLayout | undefined =
        source.length > 1 || source.some((run) => run.fontSubstituted)
          ? {
              content,
              width: paragraph.width,
              fontSize: first.fontSizePx,
              fontWeight: first.fontWeight,
              fontStyle: first.fontStyle,
              lineHeight,
              fragments,
              fontFamily: first.fontFamily,
              marks: marks.length ? marks : undefined,
            }
          : undefined;
      return {
        id: `txt_${first.page}_${runs.indexOf(first)}`,
        kind: 'text' as const,
        x: paragraph.x,
        y: paragraph.y,
        width: paragraph.width,
        height: paragraph.height,
        rotation: first.rotation ?? 0,
        page: first.page,
        content,
        fontSize: first.fontSizePx,
        fontWeight: first.fontWeight,
        fontStyle: first.fontStyle,
        fontFamily: first.fontFamily,
        fontAscent: first.fontAscent,
        color: first.color ?? '#000000',
        lineHeight,
        align: 'left',
        textDecoration: 'none',
        marks: marks.length ? marks : undefined,
        importedText,
        paintOrder: Math.min(
          ...source.map((run) => run.paintOrder ?? Number.MAX_SAFE_INTEGER),
        ),
      };
    }),
  );
}
