/** Resolve PDF font names to families available in both the editor and export.
 * Unknown fonts are substitutions, not a reason to flatten the entire page. */
export function resolveImportFont(
  sourceName: string,
  genericFamily: string,
  text: string,
  italic = false,
  type3 = false,
): { family: string; substituted: boolean } {
  const name = sourceName.replace(/^[A-Z]{6}\+/i, '');
  const standard = /^Helvetica(?:-(?:Bold|Oblique|BoldOblique))?$/i.test(name)
    ? 'Helvetica'
    : /^Times-(?:Roman|Bold|Italic|BoldItalic)$/i.test(name)
      ? 'Times-Roman'
      : /^Courier(?:-(?:Bold|Oblique|BoldOblique))?$/i.test(name)
        ? 'Courier'
        : undefined;
  const bundled =
    /^(DejaVuSansMono|DejaVuSans|DejaVuSerifCondensed)(?:-(?:Bold|Italic|Oblique|BoldItalic|BoldOblique))?$/i.exec(
      name,
    );
  if (!type3 && bundled) {
    const family = [
      'DejaVuSansMono',
      'DejaVuSans',
      'DejaVuSerifCondensed',
    ].find((value) => value.toLowerCase() === bundled[1].toLowerCase())!;
    return { family, substituted: false };
  }
  if (!type3 && /^Lato(?:-(?:Regular|Bold))?$/i.test(name) && !italic)
    return { family: 'Lato', substituted: false };
  // Standard PDF fonts use WinAnsi; Turkish, Greek, etc. need a Unicode font.
  const needsUnicode =
    /[^\u0000-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/u.test(
      text,
    );
  if (!type3 && standard && !needsUnicode)
    return { family: standard, substituted: false };

  const mono = /courier|mono|consolas|menlo|typewriter|fixed|monaco/i;
  const sans =
    /sans|helvetica|arial|lato|calibri|verdana|tahoma|roboto|gothic/i;
  const serif =
    /serif|times|georgia|cambria|palatino|garamond|baskerville|minion|antiqua|bookman|bodoni/i;
  // Prefer source-name clues; PDF.js generic defaults can be less specific.
  const family = mono.test(name)
    ? 'DejaVuSansMono'
    : sans.test(name)
      ? 'DejaVuSans'
      : serif.test(name)
        ? 'DejaVuSerifCondensed'
        : genericFamily === 'monospace'
          ? 'DejaVuSansMono'
          : genericFamily === 'serif'
            ? 'DejaVuSerifCondensed'
            : 'DejaVuSans';
  return { family, substituted: true };
}
