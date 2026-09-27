import {
  RESERVED_COMPONENT_KEYS,
  createDraftVersion,
  getActiveComponentVersion,
  getComponentDefinition,
  isReservedComponentKey,
  listComponentDefinitions,
  publishComponentVersion,
} from './component-registry';

describe('component registry', () => {
  it('registers the 13 built-in components as active v1', () => {
    const defs = listComponentDefinitions();
    expect(defs).toHaveLength(13);
    for (const def of defs) {
      expect(def.source).toBe('built-in');
      expect(def.status).toBe('active');
      expect(def.currentVersionId).toBeDefined();
      expect(def.versions).toHaveLength(1);
      expect(def.versions[0].version).toBe(1);
      expect(def.versions[0].status).toBe('published');
      expect(def.versions[0].inputSchema).toBeDefined();
      expect(def.versions[0].rendererKey).toBe(def.key);
    }
  });

  it('exposes input schema + capabilities per version', () => {
    const callout = getComponentDefinition('callout');
    expect(callout?.category).toBe('text');
    const v1 = getActiveComponentVersion('callout');
    expect(v1?.layoutCapabilities.aiSelectable).toBe(true);
    expect(v1?.defaultData).toBeDefined();
  });

  it('keeps published versions immutable across draft + publish', () => {
    const before = JSON.stringify(getActiveComponentVersion('heading'));
    const draft = createDraftVersion('heading', {
      defaultData: { text: '', level: 2 },
    });
    expect(draft.status).toBe('draft');
    expect(draft.version).toBe(2);
    // Published v1 untouched by the draft.
    expect(JSON.stringify(getActiveComponentVersion('heading'))).toBe(before);

    const published = publishComponentVersion('heading', 2);
    expect(published.status).toBe('published');
    expect(getActiveComponentVersion('heading')?.version).toBe(2);
    // v1 still in history for pinned documents.
    expect(
      getComponentDefinition('heading')?.versions.find((v) => v.version === 1),
    ).toBeDefined();
  });

  it('refuses to publish a non-draft version twice', () => {
    expect(() => publishComponentVersion('heading', 1)).toThrow();
  });

  it('reserves future catalog keys without registering renderers', () => {
    expect(RESERVED_COMPONENT_KEYS.length).toBeGreaterThan(0);
    expect(isReservedComponentKey('chart')).toBe(true);
    expect(isReservedComponentKey('heading')).toBe(false);
    expect(getComponentDefinition('chart')).toBeUndefined();
  });
});
