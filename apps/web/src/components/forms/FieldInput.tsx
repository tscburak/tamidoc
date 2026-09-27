import { type ReactNode } from 'react';
import { Button } from '../ui';
import type { TemplateField } from '../../context/TemplateStoreProvider';

/** Shared input class — kept identical to FillTemplatePage for visual parity. */
export const fieldInputCls =
  'h-9 w-full rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 disabled:placeholder:text-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:disabled:border-stone-700 dark:disabled:bg-stone-800 dark:disabled:text-stone-500 dark:disabled:placeholder:text-stone-600';

/** Renders a single field input based on its type. Clean (no debug) version of
 * the switch in FillTemplatePage. */
export function FieldInput({
  field,
  value,
  onChange,
  disabled: formDisabled,
}: {
  field: TemplateField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // Read-only when the caller disables it (e.g. submitting) OR the field itself
  // is marked disabled. Value is prefilled via initialValuesFor (defaultValue).
  const disabled = formDisabled || field.disabled === true;
  switch (field.type) {
    case 'longtext':
      return (
        <textarea
          aria-label={field.name}
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? field.name}
          className={`${fieldInputCls} h-auto resize-none py-1.5`}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          aria-label={field.name}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? field.name}
          className={fieldInputCls}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          aria-label={field.name}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={fieldInputCls}
        />
      );
    case 'checkbox':
      return (
        <label
          className={
            disabled
              ? 'flex cursor-not-allowed items-center gap-2 text-sm text-stone-400 dark:text-stone-500'
              : 'flex cursor-pointer items-center gap-2 text-sm text-stone-700 dark:text-stone-200'
          }
        >
          <input
            type="checkbox"
            aria-label={field.name}
            checked={value === 'true'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? 'true' : '')}
            className="size-4 rounded accent-orange-600"
          />
          {value === 'true' ? 'Yes' : 'No'}
        </label>
      );
    case 'image':
      return <ImageInput value={value} onChange={onChange} label={field.name} disabled={disabled} />;
    case 'dropdown': {
      const opts = field.options ?? [];
      if (opts.length === 0) {
        // No options configured → degrade to text input (keeps forms fillable).
        return (
          <input
            type="text"
            aria-label={field.name}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? field.name}
            className={fieldInputCls}
          />
        );
      }
      return (
        <select
          aria-label={field.name}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={fieldInputCls}
        >
          <option value="">{field.placeholder ?? `Select ${field.name}…`}</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    default:
      // text, email, signature → free text
      return (
        <input
          type={field.type === 'email' ? 'email' : 'text'}
          aria-label={field.name}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? field.name}
          className={fieldInputCls}
        />
      );
  }
}

export function FieldLabel({ children, required, info }: { children: ReactNode; required?: boolean; info?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-medium text-stone-600 dark:text-stone-300">
        {children}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {info && (
        <span className="text-[10px] text-stone-400 dark:text-stone-500">
          {info}
        </span>
      )}
    </div>
  );
}

function ImageInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = `img-${label}`;
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        disabled={disabled}
        onClick={() => document.getElementById(id)?.click()}
      >
        Upload
      </Button>
      {value && (
        <img src={value} alt="" className="size-9 rounded-md border border-stone-300 object-cover dark:border-stone-600" />
      )}
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-xs text-stone-400 hover:text-red-600">
          clear
        </button>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange(String(reader.result));
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
