import {
  SYSTEM_THEME_DEFAULTS,
  getComponentStyle,
  mergeThemeLayers,
  resolveTheme,
  toDocumentTheme,
} from './theme-tokens';

describe('theme tokens', () => {
  it('ships system defaults', () => {
    expect(SYSTEM_THEME_DEFAULTS.colors.primary).toBeDefined();
    expect(SYSTEM_THEME_DEFAULTS.page.size).toBe('A4');
    expect(SYSTEM_THEME_DEFAULTS.fontSizes.base).toBeGreaterThan(0);
  });

  it('resolves precedence system < org < template < component < instance', () => {
    const theme = resolveTheme({
      organization: { colors: { primary: '#111111' } },
      template: { colors: { primary: '#222222' } },
      componentDefaults: { colors: { primary: '#333333' } },
      instanceOverride: { colors: { primary: '#444444' } },
    });
    expect(theme.colors.primary).toBe('#444444');

    const withoutInstance = resolveTheme({
      organization: { colors: { primary: '#111111' } },
      template: { colors: { primary: '#222222' } },
    });
    expect(withoutInstance.colors.primary).toBe('#222222');
    // Untouched tokens fall back to system defaults.
    expect(withoutInstance.colors.secondary).toBe(
      SYSTEM_THEME_DEFAULTS.colors.secondary,
    );
  });

  it('deep-merges nested token groups', () => {
    const theme = mergeThemeLayers(undefined, {
      colors: { text: { heading: '#000000' } },
    });
    expect(theme.colors.text.heading).toBe('#000000');
    expect(theme.colors.text.body).toBe(SYSTEM_THEME_DEFAULTS.colors.text.body);
  });

  it('adapts to the flow-renderer theme shape', () => {
    const doc = toDocumentTheme(
      resolveTheme({ template: { fonts: { body: 'Arial' } } }),
    );
    expect(doc.fontFamily).toBe('Arial');
    expect(doc.colors.primary).toBe(SYSTEM_THEME_DEFAULTS.colors.primary);
    expect(doc.baseFontSize).toBe(SYSTEM_THEME_DEFAULTS.fontSizes.base);
  });
});

describe('getComponentStyle', () => {
  it('returns overrides for known components', () => {
    expect(
      getComponentStyle(
        { callout: { styles: { background: '#fef9c3' } } },
        'callout',
      ),
    ).toEqual({ background: '#fef9c3' });
    expect(
      getComponentStyle(
        { heading: { styles: { color: '#111111', fontSize: 'xl' } } },
        'heading',
      ),
    ).toEqual({ color: '#111111', fontSize: 'xl' });
  });

  it('accepts bare overrides without a styles wrapper', () => {
    expect(getComponentStyle({ quote: { color: '#222222' } }, 'quote')).toEqual(
      {
        color: '#222222',
      },
    );
  });

  it('drops malformed values and unknown components', () => {
    expect(getComponentStyle(undefined, 'heading')).toEqual({});
    expect(getComponentStyle({}, 'heading')).toEqual({});
    expect(
      getComponentStyle(
        {
          heading: {
            styles: {
              color: 'red',
              background: 'javascript:alert(1)',
              fontSize: 'huge',
              css: 'display:none',
            },
          },
        },
        'heading',
      ),
    ).toEqual({});
  });
});
