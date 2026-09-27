import { resolveImportFont } from './font-fallback';

describe('PDF font fallback', () => {
  it.each([
    ['NovelSans-BoldOblique', 'serif', 'DejaVuSans'],
    ['MySerif', 'sans-serif', 'DejaVuSerifCondensed'],
    ['Consolas', 'serif', 'DejaVuSansMono'],
    ['Unknown', 'monospace', 'DejaVuSansMono'],
    ['Unknown', 'serif', 'DejaVuSerifCondensed'],
    ['', '', 'DejaVuSans'],
    ['CustomLato', '', 'DejaVuSans'],
    ['AAAAAA+ArialMT', '', 'DejaVuSans'],
  ])('substitutes %s with a bundled family', (source, generic, family) => {
    expect(resolveImportFont(source, generic, 'Example')).toEqual({
      family,
      substituted: true,
    });
  });

  it.each([
    'Helvetica',
    'Times-Roman',
    'Courier',
    'Lato',
    'DejaVuSans',
    'DejaVuSansMono',
    'DejaVuSerifCondensed',
  ])('retains supported %s', (family) => {
    expect(resolveImportFont(`AAAAAA+${family}`, '', 'Example')).toEqual({
      family,
      substituted: false,
    });
  });

  it('uses Unicode substitutes for extended characters in standard fonts', () => {
    for (const [source, family] of [
      ['Helvetica', 'DejaVuSans'],
      ['Times-Italic', 'DejaVuSerifCondensed'],
      ['Courier-Bold', 'DejaVuSansMono'],
    ])
      expect(resolveImportFont(source, '', 'İzin: Çağrı Şule ı')).toEqual({
        family,
        substituted: true,
      });
    expect(resolveImportFont('Helvetica', '', 'Résumé €')).toEqual({
      family: 'Helvetica',
      substituted: false,
    });
  });

  it('substitutes unavailable italic faces and decoded Type3 text', () => {
    expect(resolveImportFont('Lato', '', 'Example', true)).toEqual({
      family: 'DejaVuSans',
      substituted: true,
    });
    expect(resolveImportFont('Helvetica', '', 'Example', false, true)).toEqual({
      family: 'DejaVuSans',
      substituted: true,
    });
    expect(
      resolveImportFont('AAAAAA+DejaVuSans-BoldOblique', '', 'Çağrı', true),
    ).toEqual({ family: 'DejaVuSans', substituted: false });
  });
});
