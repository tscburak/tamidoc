import {
  parseDocumentContract,
  validateContract,
  type DocumentContract,
} from './document-contract';

function contract(over: Partial<DocumentContract> = {}): DocumentContract {
  return {
    schemaVersion: '1.0',
    templateVersionId: 'tplv_123',
    title: 'Backend Architecture Guide',
    locale: 'en-US',
    components: [
      {
        instanceId: 'cmpi_1',
        componentKey: 'heading',
        componentVersion: 1,
        data: { text: 'Backend Architecture Guide', level: 1 },
      },
      {
        instanceId: 'cmpi_2',
        componentKey: 'callout',
        componentVersion: 1,
        data: {
          title: 'Core Principle',
          body: 'Prefer explicit boundaries.',
          variant: 'info',
        },
        layout: { span: 2, keepTogether: true },
      },
    ],
    ...over,
  };
}

describe('validateContract', () => {
  it('accepts the spec example contract', () => {
    expect(validateContract(contract())).toEqual({ ok: true, errors: [] });
  });

  it('rejects a broken root with a fix', () => {
    const result = validateContract({ title: 'x' });
    expect(result.ok).toBe(false);
    expect(result.errors[0].fix).toBeDefined();
  });

  it('rejects unsupported components', () => {
    const c = contract();
    c.components[0].componentKey = 'bogus-widget';
    const result = validateContract(c);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('Unsupported component');
  });

  it('flags reserved-but-unimplemented components distinctly', () => {
    const c = contract();
    c.components[0].componentKey = 'chart';
    const result = validateContract(c);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('not available yet');
  });

  it('enforces the template allowlist', () => {
    const result = validateContract(contract(), {
      allowedComponents: ['heading'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('not allowed');
    expect(result.errors[0].instanceId).toBe('cmpi_2');
  });

  it('rejects unknown component versions', () => {
    const c = contract();
    c.components[0].componentVersion = 99;
    const result = validateContract(c);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('Unknown version');
  });

  it('validates component data and names the component in the fix', () => {
    const c = contract();
    c.components[1].data = { title: 'Missing body' };
    const result = validateContract(c);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes('data.body'))).toBe(true);
    expect(result.errors.some((e) => e.fix.includes('Callout'))).toBe(true);
  });

  it('rejects layout outside the whitelist', () => {
    const c = contract();
    c.components[0].layout = { className: 'text-red-500' } as never;
    const result = validateContract(c);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes('layout'))).toBe(true);
  });

  it('rejects script content and unsafe URLs', () => {
    const bad = contract({
      components: [
        {
          instanceId: 'cmpi_9',
          componentKey: 'paragraph',
          componentVersion: 1,
          data: { text: '<script>alert(1)</script>' },
        },
      ],
    });
    expect(validateContract(bad).ok).toBe(false);
  });

  it('enforces component count limits', () => {
    const c = contract();
    const result = validateContract(c, { limits: { maxComponents: 1 } });
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('Too many components');
  });

  it('enforces composition rules (required, order, no-repeat)', () => {
    const missing = validateContract(contract(), {
      compositionRules: {
        requiredComponents: [{ key: 'table', min: 1 }],
        allowedComponents: [],
        allowRepeatedComponents: true,
      },
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0].message).toContain('Missing required');

    const order = validateContract(contract(), {
      compositionRules: {
        requiredComponents: [],
        allowedComponents: [],
        allowRepeatedComponents: true,
        orderingRules: [{ before: 'heading', after: 'callout' }],
      },
    });
    expect(order.ok).toBe(false);

    const noRepeat = validateContract(
      contract({
        components: [
          {
            instanceId: 'a',
            componentKey: 'divider',
            componentVersion: 1,
            data: {},
          },
          {
            instanceId: 'b',
            componentKey: 'divider',
            componentVersion: 1,
            data: {},
          },
        ],
      }),
      {
        compositionRules: {
          requiredComponents: [],
          allowedComponents: [],
          allowRepeatedComponents: false,
        },
      },
    );
    expect(noRepeat.ok).toBe(false);
  });

  it('accepts older pinned versions after an upgrade', () => {
    // heading v1 stays valid even though other components may move on.
    const c = contract();
    c.components[0].componentVersion = 1;
    expect(validateContract(c).ok).toBe(true);
  });
});

describe('parseDocumentContract', () => {
  it('parses valid JSON', () => {
    const raw = JSON.stringify(contract());
    const parsed = parseDocumentContract(raw);
    expect('contract' in parsed).toBe(true);
  });

  it('returns an actionable error for malformed JSON', () => {
    const parsed = parseDocumentContract('{nope');
    expect('error' in parsed).toBe(true);
    if ('error' in parsed) expect(parsed.error.fix).toBeDefined();
  });
});
