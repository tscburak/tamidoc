import {
  findUnsafeContent,
  isSafeImageSrc,
  isSafeUrl,
  sanitizeRichText,
  stripForbiddenProps,
} from './sanitize';

describe('sanitizeRichText', () => {
  it('keeps formatting tags', () => {
    expect(sanitizeRichText('<p>Hello <strong>world</strong></p>')).toContain(
      '<strong>world</strong>',
    );
  });

  it('strips script and style tags', () => {
    const out = sanitizeRichText(
      '<p>Hi</p><script>alert(1)</script><style>p{color:red}</style>',
    );
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<style>');
    expect(out).toContain('Hi');
  });

  it('strips event handlers and javascript: URLs', () => {
    const out = sanitizeRichText(
      '<a href="javascript:alert(1)" onclick="x()">click</a>',
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('onclick');
  });
});

describe('isSafeUrl / isSafeImageSrc', () => {
  it('allows http(s), storage keys and image data URLs', () => {
    expect(isSafeUrl('https://example.com/a.png')).toBe(true);
    expect(isSafeUrl('documents/abc/image.png')).toBe(true);
    expect(isSafeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });

  it('rejects javascript: and non-image data URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html;base64,PGI+')).toBe(false);
    expect(isSafeImageSrc('data:text/html;base64,PGI+')).toBe(false);
  });
});

describe('stripForbiddenProps', () => {
  it('removes className, style and handlers, reporting paths', () => {
    const obj = {
      data: { text: 'ok', className: 'x', style: 'color:red' },
      onClick: 'evil',
    };
    const removed = stripForbiddenProps(obj);
    expect(obj).toEqual({ data: { text: 'ok' } });
    expect(removed).toContain('data.className');
    expect(removed).toContain('data.style');
    expect(removed).toContain('onClick');
  });
});

describe('findUnsafeContent', () => {
  it('flags embedded script content with a fix', () => {
    const findings = findUnsafeContent({
      body: '<script>alert(1)</script>',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('body');
    expect(findings[0].fix).toBeDefined();
  });

  it('flags disallowed URL schemes', () => {
    const findings = findUnsafeContent({ src: 'javascript:alert(1)' });
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('src');
  });
});
