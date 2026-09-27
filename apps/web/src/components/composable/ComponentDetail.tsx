/**
 * Edit-mode component detail: identity + default-style editor + a live sample
 * preview rendered with the template defaults. This is the only preview shown
 * in edit mode — the full document canvas lives in fill mode.
 */
import { IconArrowLeft } from '@tabler/icons-react';
import type { DocBlock } from '../../context/TemplateStoreProvider';
import {
  getBlockDef,
  type ComponentDefaults,
  type ComponentStyle,
  type PreviewTheme,
} from './blockCatalog';
import { ComponentStyleEditor } from './ComponentStyleEditor';
import { BlockPreview } from './BlockPreview';

export function ComponentDetail({
  type,
  style,
  theme,
  componentDefaults,
  onBack,
  onStyleChange,
  onReset,
}: {
  type: string;
  style: ComponentStyle;
  theme: PreviewTheme;
  componentDefaults: ComponentDefaults;
  onBack: () => void;
  onStyleChange: (patch: Partial<ComponentStyle>) => void;
  onReset: () => void;
}) {
  const def = getBlockDef(type);
  if (!def) return null;

  const sample: DocBlock = {
    id: 'sample-preview',
    type,
    inputs: def.sampleInputs(),
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-auto">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
      >
        <IconArrowLeft size={14} /> All components
      </button>

      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-stone-800 dark:text-stone-100">
            {def.name}
          </h3>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:bg-stone-800 dark:text-stone-300">
            {def.category}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          {def.description}
        </p>
      </div>

      <ComponentStyleEditor
        typeName={def.name}
        style={style}
        onChange={onStyleChange}
        onReset={onReset}
      />

      <div className="flex min-h-0 flex-col gap-1.5">
        <span className="shrink-0 text-xs font-medium text-stone-600 dark:text-stone-300">
          Preview with these defaults
        </span>
        <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <BlockPreview
            blocks={[sample]}
            theme={theme}
            componentDefaults={componentDefaults}
          />
        </div>
      </div>
    </div>
  );
}
