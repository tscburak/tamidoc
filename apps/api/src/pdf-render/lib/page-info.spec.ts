import { resolvePageInfo } from './page-info';
import { DEFAULT_THEME } from './flow-layout';

describe('page information', () => {
  it('treats existing fields without an editable flag as locked', () => {
    const theme = {
      ...DEFAULT_THEME,
      header: { enabled: true, text: 'Fixed' },
    };
    const result = resolvePageInfo(theme, { headerText: 'Changed' });
    expect(result.errors).toEqual([
      expect.objectContaining({ path: 'headerText' }),
    ]);
    expect(result.theme.header?.text).toBe('Fixed');
  });

  it('preserves editable defaults, applies overrides, and supports clearing', () => {
    const theme = {
      ...DEFAULT_THEME,
      header: { enabled: true, text: 'Default', editable: true },
    };
    expect(resolvePageInfo(theme, {}).theme.header?.text).toBe('Default');
    expect(
      resolvePageInfo(theme, { headerText: 'Changed' }).theme.header?.text,
    ).toBe('Changed');
    expect(resolvePageInfo(theme, { headerText: '' }).theme.header?.text).toBe(
      '',
    );
    expect(theme.header.text).toBe('Default');
  });

  it('rejects oversized text and ignores a disabled field even when marked editable', () => {
    const theme = {
      ...DEFAULT_THEME,
      header: { enabled: true, text: '', editable: true },
      footer: { enabled: false, text: '', editable: true },
    };
    const result = resolvePageInfo(theme, {
      headerText: 'x'.repeat(501),
      footerText: 'hidden',
    });
    expect(result.errors.map((error) => error.path)).toEqual([
      'headerText',
      'footerText',
    ]);
  });
});
