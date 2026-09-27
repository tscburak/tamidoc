import { useEffect, useState } from 'react';
import { Badge, Button, Modal } from '../ui';
import type { TemplateField } from '../../context/TemplateStoreProvider';
import { FieldInput, FieldLabel } from './FieldInput';
import { fieldKeyOf, isFilled } from './DynamicFormFields';

/** One document (form PDF or one stack entry) whose ask-on-generate fields
 *  the owner must answer before the document can be generated. */
export interface AskDoc {
  /** Stable key (entry index for stacks, '0' for single forms). */
  key: string;
  name: string;
  fields: TemplateField[];
}

/**
 * Owner prompt for ask-on-generate fields, shown before a document (or a
 * whole stack) is generated/downloaded. Fields are grouped per document;
 * values are prefilled (saved generation values first) and validated
 * client-side — required fields must be filled before confirming. On confirm
 * the caller receives the per-document values keyed by doc key → field name.
 */
export function AskOnGenerateDialog({
  open,
  onClose,
  title = 'Generate document',
  docs,
  prefill,
  busy,
  confirmLabel = 'Generate',
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  docs: AskDoc[];
  /** docKey → field name → last saved value (or defaults, composed by caller). */
  prefill: Record<string, Record<string, string>>;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: (perDoc: Record<string, Record<string, string>>) => void;
}) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [touched, setTouched] = useState(false);

  // Re-seed from prefill every time the dialog opens for a new target.
  useEffect(() => {
    if (open) {
      setValues(structuredClone(prefill));
      setTouched(false);
    }
  }, [open, prefill]);

  const setDocValue = (docKey: string, name: string, v: string) =>
    setValues((prev) => ({ ...prev, [docKey]: { ...(prev[docKey] ?? {}), [name]: v } }));

  const missingKeys = new Set<string>();
  if (touched) {
    for (const d of docs) {
      for (const f of d.fields) {
        if (f.required && !isFilled(f.type, values[d.key]?.[f.name])) {
          missingKeys.add(fieldKeyOf(undefined, `${d.key}::${f.name}`));
        }
      }
    }
  }

  const handleConfirm = () => {
    setTouched(true);
    const stillMissing = docs.some((d) =>
      d.fields.some((f) => f.required && !isFilled(f.type, values[d.key]?.[f.name])),
    );
    if (stillMissing) return; // red rings appear; footer stays enabled so the user can retry
    onConfirm(values);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      subtitle="These fields are not on the form — provide their values for this document."
      size="lg"
      footer={
        <>
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {docs.map((d) => (
          <div key={d.key} className="flex flex-col gap-3">
            {docs.length > 1 && (
              <div className="flex items-center gap-2">
                <Badge color="orange" size="sm" variant="light">
                  {d.name}
                </Badge>
                <span className="text-[10px] text-stone-400 dark:text-stone-500">
                  {d.fields.length} field{d.fields.length === 1 ? '' : 's'}
                </span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {d.fields.map((f) => {
                const missing = missingKeys.has(fieldKeyOf(undefined, `${d.key}::${f.name}`));
                return (
                  <div key={f.name} className="flex flex-col gap-1">
                    <FieldLabel required={f.required} info={f.info}>
                      {f.name}
                    </FieldLabel>
                    <div className={missing ? 'rounded-md ring-2 ring-red-500' : undefined}>
                      <FieldInput
                        field={f}
                        value={values[d.key]?.[f.name] ?? ''}
                        onChange={(v) => setDocValue(d.key, f.name, v)}
                      />
                    </div>
                    {missing && (
                      <span className="text-[10px] text-red-500">This field is required</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
