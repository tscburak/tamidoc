import type { TextRun } from './pdf-parser';
import type { ExtractedVector } from './extract-shapes';

export interface InputCandidate {
  id: string;
  page: number;
  source: 'widget' | 'blank' | 'line' | 'box';
  label: string;
  context: string;
  hint: string;
  required: boolean;
  /** Sample value typed into the region (filled-template import); the region is still an input. */
  prefilled?: string;
  options?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface Widget {
  subtype?: string;
  fieldType?: string;
  fieldName?: string;
  alternativeText?: string;
  fieldValue?: string;
  rect?: number[];
  readOnly?: boolean;
  hidden?: boolean;
  pushButton?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  multiLine?: boolean;
  required?: boolean;
  options?: { displayValue: string }[];
}

/** Geometry stays in code; Jev judges the meaning of these bounded candidates. */
export function collectInputCandidates(
  runs: TextRun[],
  shapes: ExtractedVector[],
  annotations: Widget[],
  viewport: {
    width: number;
    height: number;
    convertToViewportRectangle(rect: number[]): number[];
  },
  page: number,
): InputCandidate[] {
  const candidates: InputCandidate[] = [];
  const nearby = (x: number, y: number, width: number) =>
    runs
      .filter(
        (r) =>
          Math.abs(r.y - y) < 55 &&
          r.x < x + width + 100 &&
          r.x + r.width > x - 240,
      )
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((r) => r.text)
      .join(' ')
      .slice(0, 700);
  const labelAt = (
    x: number,
    y: number,
    width: number,
    exclude?: TextRun[],
  ) => {
    const pool = exclude ? runs.filter((r) => !exclude.includes(r)) : runs;
    const left = pool.filter(
      (r) => Math.abs(r.y - y) < 18 && r.x + r.width <= x + 4,
    );
    const above = pool.filter(
      (r) => r.y < y && y - r.y < 40 && r.x < x + width && r.x + r.width > x,
    );
    const right = pool.filter(
      (r) => Math.abs(r.y - y) < 18 && r.x >= x + width && r.x - x - width < 40,
    );
    return (
      (
        left.sort((a, b) => b.x - a.x)[0] ??
        right[0] ??
        above.sort((a, b) => b.y - a.y)[0]
      )?.text ?? ''
    );
  };
  const add = (c: Omit<InputCandidate, 'id' | 'page' | 'context'>) => {
    const x = Math.max(0, c.x);
    const y = Math.max(0, c.y);
    const width = Math.min(c.x + c.width, viewport.width) - x;
    const height = Math.min(c.y + c.height, viewport.height) - y;
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      width < 4 ||
      height < 4
    )
      return;
    // Widgets win over graphical duplicates. Text blanks win over underline paths.
    if (
      candidates.some((a) => {
        const overlap =
          Math.max(0, Math.min(a.x + a.width, x + width) - Math.max(a.x, x)) *
          Math.max(0, Math.min(a.y + a.height, y + height) - Math.max(a.y, y));
        return overlap / Math.min(a.width * a.height, width * height) > 0.65;
      })
    )
      return;
    candidates.push({
      ...c,
      x,
      y,
      width,
      height,
      page,
      id: `input_${page}_${candidates.length}`,
      context: nearby(x, y, width),
      label: c.label.slice(0, 160),
    });
  };

  for (const a of annotations) {
    if (
      a.subtype !== 'Widget' ||
      !a.rect ||
      a.readOnly ||
      a.hidden ||
      a.pushButton ||
      a.radioButton
    )
      continue;
    if (!['Tx', 'Btn', 'Ch', 'Sig'].includes(a.fieldType ?? '')) continue;
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    const x = Math.min(x1, x2),
      y = Math.min(y1, y2);
    const width = Math.abs(x2 - x1),
      height = Math.abs(y2 - y1);
    add({
      source: 'widget',
      x,
      y,
      width,
      height,
      fontSize: Math.min(14, height * 0.7),
      label: a.alternativeText || a.fieldName || labelAt(x, y, width),
      hint: a.checkBox
        ? 'checkbox'
        : a.fieldType === 'Sig'
          ? 'signature'
          : a.fieldType === 'Ch'
            ? 'dropdown'
            : a.multiLine
              ? 'longtext'
              : 'text',
      required: !!a.required,
      prefilled:
        typeof a.fieldValue === 'string' && a.fieldValue.trim()
          ? a.fieldValue.trim().slice(0, 200)
          : undefined,
      options: a.options?.map((o) => o.displayValue).slice(0, 100),
    });
  }
  for (const r of runs) {
    if (Math.abs(r.rotation ?? 0) > 1) continue;
    const blanks =
      /_{3,}|\.{3,}|[-\u2013\u2014]{3,}|\[\s?\]|\[[xX\u2713\u2714]\]|[\u2610\u25a1\u2611\u2612]/g;
    let previousEnd = 0;
    for (const match of r.text.matchAll(blanks)) {
      const start = match.index;
      const end = start + match[0].length;
      const isCheck =
        /^(?:\[\s?\]|\[[xX\u2713\u2714]|[\u2610\u25a1\u2611\u2612])/u.test(
          match[0],
        );
      const x = r.x + (r.width * start) / r.text.length;
      const width = (r.width * match[0].length) / r.text.length;
      const before = r.text
        .slice(previousEnd, start)
        .replace(/[:\s]+$/, '')
        .trim();
      const after = r.text
        .slice(end)
        .split(
          /_{3,}|\.{3,}|\[\s?\]|\[[xX\u2713\u2714]\]|[\u2610\u25a1\u2611\u2612]/,
        )[0]
        .trim();
      add({
        source: 'blank',
        x,
        y: r.y,
        width,
        height: r.height,
        fontSize: r.fontSizePx,
        label: isCheck
          ? after || before || labelAt(x, r.y, width)
          : before || labelAt(x, r.y, width),
        hint: isCheck ? 'checkbox' : 'text',
        required: false,
        prefilled:
          isCheck && /[xX\u2713\u2714\u2611\u2612]/.test(match[0])
            ? 'checked'
            : undefined,
      });
      previousEnd = end;
    }
  }
  for (const s of shapes) {
    if (s.kind !== 'shape' || Math.abs(s.rotation) > 1) continue;
    const line =
      (s.shape === 'line' || s.shape === 'rectangle') &&
      s.height <= 3 &&
      s.width >= 30;
    const box =
      s.shape === 'rectangle' &&
      s.width >= 8 &&
      s.height >= 8 &&
      s.height <= 180 &&
      (!s.fill || s.fill === 'transparent' || /^#ffffff(?:ff)?$/i.test(s.fill));
    if (!line && !box) continue;
    const y = line ? s.y - 18 : s.y + 2;
    const height = line ? 18 : s.height - 4;
    const width = line ? s.width : s.width - 4;
    const x = line ? s.x : s.x + 2;
    // Text inside the region is a filled-in sample answer, not artwork — the
    // region is still an input. Prose or table text crossing the region
    // horizontally (or far exceeding it) is content, not a filled value.
    const occupants = runs.filter(
      (r) =>
        r.text.trim() &&
        r.x < x + width &&
        r.x + r.width > x &&
        r.y < y + height - 2 &&
        r.y + r.height > y + 2,
    );
    const prefilled = occupants
      .map((r) => r.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      occupants.some((r) => r.x + r.width > x + width + 30 || r.x < x - 30) ||
      prefilled.length > 200
    )
      continue;
    const label = labelAt(x, y, width, occupants);
    if (!label) continue;
    add({
      source: line ? 'line' : 'box',
      x,
      y,
      width,
      height,
      fontSize: Math.min(14, height * 0.7),
      label,
      hint:
        box && s.width <= 28 && s.height <= 28
          ? 'checkbox'
          : height > 40
            ? 'longtext'
            : 'text',
      required: false,
      prefilled: prefilled || undefined,
    });
  }
  return candidates;
}

/**
 * Field name for an input candidate: the label verbatim. Names double as
 * display labels, so no slugification — case, spacing and non-ASCII survive.
 * Repeated labels share one field (repetitive inputs stay in sync through the
 * same `{{token}}`), hence no `_2`/`_3` uniquification. Only token-breaking
 * characters are stripped and prototype-polluting keys are prefixed; empty
 * labels fall back to `field_N`.
 */
export function inputName(label: string, index: number): string {
  const base = label
    .replace(/[{}]/g, '')
    .trim()
    .slice(0, 160);
  if (!base) return `field_${index + 1}`;
  if (/^(?:__proto__|prototype|constructor)$/.test(base))
    return `field_${base}`;
  return base;
}
