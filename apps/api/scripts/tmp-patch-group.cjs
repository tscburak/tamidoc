const fs = require('fs');
const f = 'src/pdf-import/lib/group-paragraphs.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (oldStr, newStr) => {
  const i = s.indexOf(oldStr);
  if (i < 0) {
    console.error('NOT FOUND:', JSON.stringify(oldStr.slice(0, 80)));
    process.exit(1);
  }
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
};

// 1. ParagraphLine segments + LineSegment interface
rep(
  `  fontSizePx: number; // design-space px
  fontWeight: FontWeightLite;
  fontStyle: FontStyleLite;
  top: number; // top edge (y), design-space px
  bottom: number; // bottom edge (y), design-space px
}`,
  `  fontSizePx: number; // design-space px
  fontWeight: FontWeightLite; // dominant segment style (compat/fallback)
  fontStyle: FontStyleLite;
  top: number; // top edge (y), design-space px
  bottom: number; // bottom edge (y), design-space px
  /** Style runs within the line, in order. \`text\` is their concatenation. */
  segments?: LineSegment[];
}

/**
 * A run of same-style text inside a line. Style changes no longer split
 * paragraphs — they become in-text marks on one component.
 */
export interface LineSegment {
  text: string;
  fontWeight: FontWeightLite;
  fontStyle: FontStyleLite;
}`,
);

// 2. Paragraph doc: style no longer has to match
rep(
  ` * A paragraph: one or more adjacent lines of the same style merged into a single
 * multi-line text layer. Becomes one TextComponent.`,
  ` * A paragraph: one or more adjacent lines merged into a single multi-line text
 * layer (style may vary within — it becomes in-text marks). Becomes one
 * TextComponent.`,
);

// 3. Line build: collect per-run style segments
rep(
  `    for (const g of groups) {
      // Re-insert a space between segments separated by a word gap (mirror of
      // pdf-parser's coalescing join) so line text keeps its real word spacing.
      let text = '';
      for (let i = 0; i < g.length; i++) {
        if (i > 0) {
          const prev = g[i - 1];
          const gap = g[i].x - (prev.x + prev.width);
          if (
            gap > g[i].fontSizePx * 0.1 &&
            !/\\s$/.test(text) &&
            !/^\\s/.test(g[i].text)
          ) {
            text += ' ';
          }
        }
        text += g[i].text;
      }
      const x = Math.min(...g.map((r) => r.x));
      const right = Math.max(...g.map((r) => r.x + r.width));
      const top = Math.min(...g.map((r) => r.y));
      const bottom = Math.max(...g.map((r) => r.y + r.height));
      // Dominant style across the group (first non-normal wins, else normal).
      const fontWeight =
        g.find((r) => r.fontWeight === 'bold')?.fontWeight ?? 'normal';
      const fontStyle =
        g.find((r) => r.fontStyle === 'italic')?.fontStyle ?? 'normal';
      lines.push({
        baselineY: g[0].baselineY,
        text,
        x,
        width: right - x,
        fontSizePx: g[0].fontSizePx,
        fontWeight,
        fontStyle,
        top,
        bottom,
      });
    }`,
  `    for (const g of groups) {
      // Re-insert a space between segments separated by a word gap (mirror of
      // pdf-parser's coalescing join) so line text keeps its real word spacing.
      // Style runs are kept as segments — style no longer splits paragraphs,
      // it becomes in-text marks downstream.
      let text = '';
      const segments: LineSegment[] = [];
      const pushSeg = (seg: LineSegment) => {
        if (!seg.text) return;
        const last = segments[segments.length - 1];
        if (
          last &&
          last.fontWeight === seg.fontWeight &&
          last.fontStyle === seg.fontStyle
        )
          last.text += seg.text;
        else segments.push({ ...seg });
      };
      for (let i = 0; i < g.length; i++) {
        if (i > 0) {
          const prev = g[i - 1];
          const gap = g[i].x - (prev.x + prev.width);
          if (
            gap > g[i].fontSizePx * 0.1 &&
            !/\\s$/.test(text) &&
            !/^\\s/.test(g[i].text)
          ) {
            text += ' ';
            pushSeg({
              text: ' ',
              fontWeight: prev.fontWeight,
              fontStyle: prev.fontStyle,
            });
          }
        }
        text += g[i].text;
        pushSeg({
          text: g[i].text,
          fontWeight: g[i].fontWeight,
          fontStyle: g[i].fontStyle,
        });
      }
      const x = Math.min(...g.map((r) => r.x));
      const right = Math.max(...g.map((r) => r.x + r.width));
      const top = Math.min(...g.map((r) => r.y));
      const bottom = Math.max(...g.map((r) => r.y + r.height));
      // Dominant style across the line: the longest segment's (fallback:
      // first non-normal, else normal).
      const dom = (pick: (seg: LineSegment) => FontWeightLite | FontStyleLite, matchVal: string) => {
        let best = '';
        let winner: string | undefined;
        for (const seg of segments) {
          const v = pick(seg) as string;
          if (v !== matchVal && seg.text.length > best) {
            best = seg.text.length;
            winner = v;
          }
        }
        return winner ?? matchVal;
      };
      const fontWeight = dom((sg) => sg.fontWeight, 'normal') as FontWeightLite;
      const fontStyle = dom((sg) => sg.fontStyle, 'normal') as FontStyleLite;
      lines.push({
        baselineY: g[0].baselineY,
        text,
        x,
        width: right - x,
        fontSizePx: g[0].fontSizePx,
        fontWeight,
        fontStyle,
        top,
        bottom,
        segments,
      });
    }`,
);

// 4. sameParagraph: drop the style split
rep(
  `  // Font size close enough.
  if (Math.abs(line.fontSizePx - fs) > sizeTolerance(fs)) return false;

  // Same style (bold lead-in ≠ body, etc.).
  if (line.fontWeight !== p.fontWeight || line.fontStyle !== p.fontStyle)
    return false;

  // Horizontal column overlap`,
  `  // Font size close enough (bigger deltas = headings, still split).
  if (Math.abs(line.fontSizePx - fs) > sizeTolerance(fs)) return false;

  // Style differences do NOT split — bold lead-ins, italic phrases, etc. stay
  // in the paragraph as in-text marks.

  // Horizontal column overlap`,
);

// 5. finalize: recompute dominant style across all segments
rep(
  `/** Recompute bbox from lines (defensive — also collapses any drift). */
function finalize(p: Paragraph): void {
  if (p.lines.length === 0) return;
  const xs = p.lines.map((l) => l.x);
  const rights = p.lines.map((l) => l.x + l.width);
  const tops = p.lines.map((l) => l.top);
  const bottoms = p.lines.map((l) => l.bottom);
  p.x = Math.min(...xs);
  p.width = Math.max(...rights) - p.x;
  p.y = Math.min(...tops);
  p.height = Math.max(...bottoms) - p.y;
}`,
  `/** Recompute bbox from lines (defensive — also collapses any drift) and the
 * dominant weight/style from the style segments (longest text wins; line-level
 * fallback when a fixture carries no segments). */
function finalize(p: Paragraph): void {
  if (p.lines.length === 0) return;
  const xs = p.lines.map((l) => l.x);
  const rights = p.lines.map((l) => l.x + l.width);
  const tops = p.lines.map((l) => l.top);
  const bottoms = p.lines.map((l) => l.bottom);
  p.x = Math.min(...xs);
  p.width = Math.max(...rights) - p.x;
  p.y = Math.min(...tops);
  p.height = Math.max(...bottoms) - p.y;

  const allSegs = p.lines.flatMap((l) => l.segments ?? []);
  const dominant = (key: 'fontWeight' | 'fontStyle', plain: string) => {
    if (allSegs.length) {
      // Longest styled text wins.
      const lens = new Map<string, number>();
      for (const seg of allSegs) {
        if (seg[key] === plain) continue;
        lens.set(seg[key], (lens.get(seg[key]) ?? 0) + seg.text.length);
      }
      let winner = plain;
      let best = 0;
      for (const [v, len] of lens)
        if (len > best) {
          best = len;
          winner = v;
        }
      return winner;
    }
    // Line-level fallback (fixtures without segments): majority by line count.
    const styled = p.lines.filter((l) => l[key] !== plain);
    return styled.length * 2 > p.lines.length ? styled[0][key] : plain;
  };
  p.fontWeight = dominant('fontWeight', 'normal') as FontWeightLite;
  p.fontStyle = dominant('fontStyle', 'normal') as FontStyleLite;
}`,
);

fs.writeFileSync(f, s);
console.log('patched ok');
