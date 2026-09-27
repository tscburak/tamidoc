import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconLink,
  IconUnlink,
  IconEye,
  IconRefresh,
} from '@tabler/icons-react';
import { Button, Spinner, Badge, Modal, PasswordInput, TextInput } from '../../components/ui';
import { fieldInputCls, DynamicFormFields, initialValuesFor, type FillValues } from '../../components/forms';
import type { TemplateField } from '../../context/TemplateStoreProvider';
import type { ComponentGroup } from '../../components/designer';
import { useToast } from '../../context/toast';
import { formsService, type FormFieldOverride } from '../../services/forms.service';
import {
  stackFormsService,
  type PreviewStackFormResult,
  type FieldOverride,
  type ManualLink,
  type FieldMember,
} from '../../services/stack-forms.service';
import { templatesService } from '../../services/templates.service';
import { cn } from '../../lib/cn';

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'image', label: 'Image' },
  { value: 'signature', label: 'Signature' },
];

const canon = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, '');

/** Deep-enough equality for one FillValues entry (string or entries array). */
const fillValEq = (a?: FillValues[string], b?: FillValues[string]) => JSON.stringify(a) === JSON.stringify(b);

type Mode = 'single' | 'stack';

export function FormReviewPage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();

  const mode = (sp.get('mode') === 'stack' ? 'stack' : 'single') as Mode;
  const nameParam = sp.get('name') ?? '';

  const [name, setName] = useState(nameParam);
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // Base field set + groups (single: snapshot; stack: unified).
  const [baseFields, setBaseFields] = useState<TemplateField[]>([]);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [overrides, setOverrides] = useState<Record<string, FieldOverride | FormFieldOverride>>({});

  // Stack-only: draft stack form (created server-side, loaded by id)
  const [draftId, setDraftId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewStackFormResult | null>(null);
  const [links, setLinks] = useState<ManualLink[]>([]);
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null); // unified field key

  // Live preview values
  const [previewValues, setPreviewValues] = useState<FillValues>({});

  // Field card expand/collapse (keyed by okey). Conflicted fields auto-expand once.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seenConflictsRef = useRef<Set<string>>(new Set());
  // Preview keys the user typed into — dirty keys survive override edits.
  const dirtyPreviewRef = useRef<Set<string>>(new Set());

  const toggleExpand = (k: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const buildPath = (p: string) => `/o/${organizationId}/${p}`;
  const back = () => navigate(buildPath('forms'));

  const okey = useCallback(
    (f: TemplateField) => (mode === 'stack' ? `${f.groupId ?? ''}::${canon(f.name)}` : `${f.groupId ?? ''}::${f.name}`),
    [mode],
  );

  const effectiveFields = useMemo(
    () => baseFields.map((f) => ({ ...f, ...((overrides[okey(f)] as Partial<TemplateField>) ?? {}) })),
    [baseFields, overrides, okey],
  );

  // ---- Load base fields ----
  const loadSingle = useCallback(
    async (templateId: string, version?: string) => {
      const snap = await templatesService.getVersion(organizationId!, templateId, version ?? '');
      setBaseFields((snap.fields ?? []) as TemplateField[]);
      setGroups((snap.groups ?? []) as ComponentGroup[]);
    },
    [organizationId],
  );

  // Load a draft stack form by id; conflicts/membership come recomputed server-side.
  const loadStack = useCallback(
    async (id: string) => {
      const res = await stackFormsService.get(organizationId!, id);
      setDraftId(res.id);
      setPreview({
        entries: res.entries,
        unifiedFields: res.unifiedFields,
        unifiedGroups: res.unifiedGroups,
        conflicts: res.conflicts ?? [],
        membership: res.membership ?? {},
      });
      setBaseFields(res.unifiedFields);
      setGroups(res.unifiedGroups);
      setLinks(res.links ?? []);
      // Auto-expand newly-conflicted fields. The seen-ref keeps link round-trips
      // (which re-run this loader) from re-opening cards the user collapsed,
      // while genuinely new conflicts still get attention.
      const newly: string[] = [];
      for (const f of res.unifiedFields) {
        const c = (res.conflicts ?? []).find(
          (cc) => cc.canonicalName === canon(f.name) && cc.kind === (f.groupId ? 'group' : 'scalar'),
        );
        const k = `${f.groupId ?? ''}::${canon(f.name)}`;
        if (c && !seenConflictsRef.current.has(k)) {
          seenConflictsRef.current.add(k);
          newly.push(k);
        }
      }
      if (newly.length) setExpanded((prev) => new Set([...prev, ...newly]));
    },
    [organizationId],
  );

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      try {
        setLoading(true);
        if (mode === 'single') {
          const tid = sp.get('templateId');
          if (!tid) return back();
          await loadSingle(tid, sp.get('version') ?? undefined);
        } else {
          const draft = sp.get('draft');
          if (!draft) return back();
          await loadStack(draft);
        }
      } catch {
        /* axios surfaces toast */
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, mode]);

  // Preview is a test sandbox: mark keys the user typed into so the seeding
  // effect below never wipes them. onValuesChange only fires on user events and
  // always carries the whole values object, so a per-key diff isolates the
  // key(s) a single event actually changed.
  const handlePreviewValuesChange = (next: FillValues) => {
    for (const k of Object.keys(next)) {
      if (!fillValEq(next[k], previewValues[k])) dirtyPreviewRef.current.add(k);
    }
    setPreviewValues(next);
  };

  // Seed preview values from effective defaults. Dirty (user-typed) keys keep
  // their current value; only untouched keys follow default/override edits.
  useEffect(() => {
    if (mode === 'single' || preview) {
      const seed = initialValuesFor(effectiveFields, groups);
      setPreviewValues((prev) => {
        const next: FillValues = {};
        // Rebuild from the field/group universe — initialValuesFor omits
        // default-less keys, so iterating seed keys alone would drop typed
        // values in those fields.
        const universe = new Set<string>([
          ...effectiveFields.filter((f) => !f.groupId).map((f) => f.name),
          ...groups.map((g) => g.name),
        ]);
        for (const k of universe) {
          if (dirtyPreviewRef.current.has(k) && prev[k] !== undefined) next[k] = prev[k];
          else if (seed[k] !== undefined) next[k] = seed[k];
        }
        return next;
      });
    }
  }, [effectiveFields, groups, mode, preview]);

  const resetPreview = () => {
    dirtyPreviewRef.current = new Set();
    setPreviewValues(initialValuesFor(effectiveFields, groups));
  };

  const setOverride = (f: TemplateField, patch: Partial<FieldOverride>) =>
    setOverrides((prev) => ({ ...prev, [okey(f)]: { ...(prev[okey(f)] ?? {}), ...patch } }));

  // ---- Stack mapping: persist new links on the draft, reload the re-merge ----
  const rePreviewLinks = useCallback(
    async (nextLinks: ManualLink[]) => {
      if (mode !== 'stack' || !organizationId || !draftId) return;
      try {
        await stackFormsService.update(organizationId, draftId, { links: nextLinks });
        await loadStack(draftId);
      } catch {
        /* axios surfaces toast */
      }
    },
    [mode, organizationId, draftId, loadStack],
  );

  const linkMember = (targetField: TemplateField, member: FieldMember) => {
    const next = [
      ...links.filter((l) => !(l.templateId === member.templateId && l.name === member.name && (l.groupName ?? '') === (member.groupName ?? ''))),
      { templateId: member.templateId, name: member.name, groupName: member.groupName, targetName: targetField.name },
    ];
    setLinks(next);
    setLinkPickerFor(null);
    rePreviewLinks(next);
  };

  const unlinkMember = (member: FieldMember) => {
    // Only manually-linked members can be unlinked.
    const next = links.filter(
      (l) => !(l.templateId === member.templateId && l.name === member.name && (l.groupName ?? '') === (member.groupName ?? '')),
    );
    setLinks(next);
    rePreviewLinks(next);
  };

  const isManuallyLinked = (member: FieldMember) =>
    links.some((l) => l.templateId === member.templateId && l.name === member.name && (l.groupName ?? '') === (member.groupName ?? ''));

  // ---- Publish ----
  const handlePublish = async () => {
    if (!organizationId) return;
    setPublishing(true);
    try {
      if (mode === 'single') {
        const tid = sp.get('templateId');
        if (!tid) return;
        await formsService.create(organizationId, {
          templateId: tid,
          version: sp.get('version') ?? undefined,
          name: name.trim() || undefined,
          password: password || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          overrides: overrides as Record<string, FormFieldOverride>,
        });
      } else {
        if (!draftId) return;
        // Publish the draft: apply overrides + publish options, flip to active.
        await stackFormsService.update(organizationId, draftId, {
          links,
          overrides: overrides as Record<string, FieldOverride>,
          name: name.trim() || undefined,
          password: password || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          status: 'active',
        });
      }
      toast.show({ title: 'Form published', message: `"${name.trim() || 'Form'}" is ready to share.`, color: 'teal' });
      setPublishOpen(false);
      navigate(buildPath('forms'));
    } catch {
      /* axios surfaces toast */
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const scalarFields = effectiveFields.filter((f) => !f.groupId);
  const groupFields = effectiveFields.filter((f) => f.groupId);
  const memberKey = (f: TemplateField) => `${f.groupId ?? ''}::${canon(f.name)}`;

  const isConflictResolved = (f: TemplateField, conflict?: { property: string }) => {
    if (!conflict) return undefined;
    const o = overrides[okey(f)] as FieldOverride | undefined;
    return o?.[conflict.property as 'type' | 'options'] !== undefined;
  };

  // Shared props for both FieldCard call sites (scalar + group members).
  const cardProps = (f: TemplateField, kind: 'scalar' | 'group') => {
    const conflict =
      mode === 'stack'
        ? preview?.conflicts.find((c) => c.kind === kind && c.canonicalName === canon(f.name))
        : undefined;
    return {
      field: f,
      conflict,
      conflictResolved: isConflictResolved(f, conflict),
      members: mode === 'stack' ? preview?.membership[memberKey(f)] : undefined,
      onLinkableClick: () => setLinkPickerFor(linkPickerFor === okey(f) ? null : okey(f)),
      linkPickerOpen: linkPickerFor === okey(f),
      onLink: (m: FieldMember) => linkMember(f, m),
      onUnlink: unlinkMember,
      isManuallyLinked,
      onChange: (patch: Partial<FieldOverride>) => setOverride(f, patch),
      expanded: expanded.has(okey(f)),
      onToggleExpand: () => toggleExpand(okey(f)),
    };
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-6 py-6 lg:h-screen lg:overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            className="-ml-1 flex size-9 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
            aria-label="Back to forms"
          >
            <IconArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">
              {mode === 'stack' ? 'Review stack form' : 'Review form'}
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Override field properties, preview the filler's view, then publish.
            </p>
          </div>
        </div>
        <Button onClick={() => setPublishOpen(true)}>
          <IconDeviceFloppy size={16} /> Publish
        </Button>
      </div>

      {mode === 'stack' && preview && preview.conflicts.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {preview.conflicts.length} field{preview.conflicts.length === 1 ? '' : 's'} had conflicting types/options across templates. Confirm the value to use below.
          </span>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-6 lg:min-h-0 lg:grid-cols-[1fr_minmax(320px,420px)]">
        {/* Left — field cards */}
        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          {scalarFields.length === 0 && groupFields.length === 0 && (
            <p className="rounded-md border border-dashed border-stone-300 p-3 text-center text-xs text-stone-400 dark:border-stone-600">
              This form has no fields.
            </p>
          )}

          {/* Scalars */}
          {scalarFields.map((f) => (
            <FieldCard
              key={okey(f)}
              {...cardProps(f, 'scalar')}
              linkCandidates={
                mode === 'stack' && preview
                  ? Object.values(preview.membership)
                      .flat()
                      .filter((m) => !m.groupName && !(preview.membership[memberKey(f)] ?? []).some((mm) => mm.templateId === m.templateId && mm.name === m.name))
                  : []
              }
            />
          ))}

          {/* Groups */}
          {groups.map((g) => {
            const members = groupFields.filter((f) => f.groupId === g.id);
            if (members.length === 0) return null;
            return (
              <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                <div className="flex items-center gap-2">
                  <Badge color="orange" size="sm" variant="light">↻ {g.name}</Badge>
                  <span className="text-xs text-stone-400">repeats · {members.length} field{members.length === 1 ? '' : 's'}</span>
                </div>
                {members.map((f) => (
                  <FieldCard key={okey(f)} {...cardProps(f, 'group')} linkCandidates={[]} />
                ))}
              </div>
            );
          })}
        </div>

        {/* Right — live preview, stretched to the viewport height */}
        <div className="flex min-h-0 flex-col">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-800">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-2.5 dark:border-stone-700">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <IconEye size={14} /> Live preview
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-stone-400">try it out — nothing is saved</span>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconRefresh size={13} />}
                  onClick={resetPreview}
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="max-h-[70vh] min-h-0 flex-1 overflow-y-auto p-4 lg:max-h-none">
              <DynamicFormFields
                fields={effectiveFields}
                groups={groups}
                values={previewValues}
                onValuesChange={handlePreviewValuesChange}
                missingFields={new Set()}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Publish dialog — settings live with the action so nothing is missed
          below a long field list, and the password state is reviewed at the
          exact moment of publishing. */}
      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish form"
        subtitle="Anyone with the link can fill this form once it's live."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="subtle" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePublish} loading={publishing}>
              <IconDeviceFloppy size={16} /> Publish
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <TextInput
            label="Form name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Form name"
          />
          <PasswordInput
            label="Password"
            description="Fillers must enter this to access the form. Leave blank for no password."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank for no password"
            autoComplete="new-password"
            name="tamidoc-form-access-password"
          />
          {password && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              A password is set — fillers must enter it to open this form. Clear the field above to remove it.
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-600 dark:text-stone-300">
            Expiry
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={fieldInputCls}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ Link picker popup ------------------------------ */

/** Scrollable popover anchored under the "Link field" button. Closes on
 *  Escape, outside click, or picking a candidate. */
function LinkPickerPopup({
  candidates,
  onPick,
  onClose,
}: {
  candidates: FieldMember[];
  onPick: (m: FieldMember) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Group candidates by template, preserving first-seen order.
  const groups = useMemo(() => {
    const map = new Map<string, FieldMember[]>();
    for (const m of candidates) {
      const list = map.get(m.templateName) ?? [];
      list.push(m);
      map.set(m.templateName, list);
    }
    return Array.from(map.entries());
  }, [candidates]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-1 max-h-60 w-72 overflow-y-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
    >
      {groups.length === 0 ? (
        <span className="px-2 py-1 text-xs text-stone-400">No other fields to link.</span>
      ) : (
        groups.map(([templateName, members]) => (
          <div key={templateName} role="group" aria-label={templateName} className="flex flex-col">
            <span className="sticky top-0 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:bg-stone-900">
              {templateName}
            </span>
            {members.map((m, i) => (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onPick(m)}
                className="rounded px-2 py-1 text-left text-xs text-stone-700 hover:bg-orange-50 hover:text-orange-700 dark:text-stone-200 dark:hover:bg-orange-950/40"
              >
                {m.name}
                {m.groupName ? <span className="text-stone-400"> · {m.groupName}</span> : null}
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------- Field card ------------------------------- */

function FieldCard({
  field,
  conflict,
  conflictResolved,
  members,
  expanded,
  onToggleExpand,
  linkPickerOpen,
  linkCandidates,
  onLinkableClick,
  onLink,
  onUnlink,
  isManuallyLinked,
  onChange,
}: {
  field: TemplateField;
  conflict?: { property: string; variants: { templateName: string; value: unknown }[] };
  conflictResolved?: boolean;
  members?: FieldMember[];
  expanded: boolean;
  onToggleExpand: () => void;
  linkPickerOpen: boolean;
  linkCandidates: FieldMember[];
  onLinkableClick: () => void;
  onLink: (m: FieldMember) => void;
  onUnlink: (m: FieldMember) => void;
  isManuallyLinked: (m: FieldMember) => boolean;
  onChange: (patch: Partial<FieldOverride>) => void;
}) {
  const optionsStr = (field.options ?? []).join(', ');
  const unresolved = !!conflict && !conflictResolved;
  // The chosen ring follows the effective value, so it stays accurate when the
  // user hand-edits type/options instead of clicking a variant.
  const variantMatches = (v: unknown) =>
    conflict!.property === 'options'
      ? Array.isArray(v) && (field.options ?? []).join(' ') === v.join(' ')
      : String(field.type) === String(v);
  const applyVariant = (v: unknown) =>
    onChange(conflict!.property === 'options' ? { options: (Array.isArray(v) ? v : []) as string[] } : { type: String(v) });

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-white p-3 dark:bg-stone-800',
        unresolved ? 'border-amber-300 dark:border-amber-700' : 'border-stone-200 dark:border-stone-700',
      )}
    >
      {/* Header — expand toggle + state badges | quick toggles (kept as siblings
          so toggling a checkbox never collapses the card) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex min-w-0 flex-wrap items-center gap-1.5 text-left"
        >
          {expanded ? (
            <IconChevronDown size={14} className="shrink-0 text-stone-400" />
          ) : (
            <IconChevronRight size={14} className="shrink-0 text-stone-400" />
          )}
          <span className="font-medium text-stone-800 dark:text-stone-100">{field.name}</span>
          {field.visible === false && <Badge color="gray" size="sm" variant="light">hidden</Badge>}
          {field.disabled && <Badge color="blue" size="sm" variant="light">disabled</Badge>}
          {field.required && <Badge color="red" size="sm" variant="light">required</Badge>}
          {field.askOnGenerate && <Badge color="orange" size="sm" variant="light">ask on generate</Badge>}
          {conflict && (
            <Badge color={conflictResolved ? 'teal' : 'amber'} size="sm" variant="light" leftSection={<IconAlertTriangle size={11} />}>
              {conflictResolved ? 'resolved' : `${conflict.property} conflict`}
            </Badge>
          )}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
            <input type="checkbox" checked={field.visible !== false} onChange={(e) => onChange({ visible: e.target.checked })} className="size-3 rounded accent-orange-600" />
            Visible
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
            <input type="checkbox" checked={!!field.disabled} onChange={(e) => onChange({ disabled: e.target.checked })} className="size-3 rounded accent-orange-600" />
            Disabled
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
            <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} className="size-3 rounded accent-orange-600" />
            Required
          </label>
          <label
            title={field.groupId ? "Group fields can't ask on generate" : 'Hidden from the form; the owner is prompted when generating documents'}
            className={
              field.groupId
                ? 'flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500'
                : 'flex cursor-pointer items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400'
            }
          >
            <input
              type="checkbox"
              disabled={!!field.groupId}
              checked={!!field.askOnGenerate}
              onChange={(e) => onChange({ askOnGenerate: e.target.checked })}
              className="size-3 rounded accent-orange-600"
            />
            Ask
          </label>
        </div>
      </div>

      {/* Collapsed summary (stack) */}
      {!expanded && members && members.length > 0 && (
        <p className="text-[11px] text-stone-500 dark:text-stone-400">
          Merged from {members.length} template{members.length === 1 ? '' : 's'}
        </p>
      )}

      {expanded && (
        <>
          {/* Conflict resolution — click a variant to use its value */}
          {conflict && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                {conflictResolved ? 'Using:' : 'Templates disagree — pick one:'}
              </span>
              <div className="flex flex-wrap gap-1">
                {conflict.variants.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyVariant(v.value)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-left text-[11px] transition-colors',
                      variantMatches(v.value)
                        ? 'border-orange-500 bg-orange-50 text-orange-800 ring-1 ring-orange-500 dark:border-orange-400 dark:bg-orange-950/40 dark:text-orange-200'
                        : unresolved
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:border-orange-400 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
                          : 'border-stone-300 text-stone-600 hover:border-orange-400 dark:border-stone-600 dark:text-stone-300',
                    )}
                  >
                    <span className="font-medium">{v.templateName}:</span>{' '}
                    {Array.isArray(v.value) ? (v.value as string[]).join(' | ') : String(v.value)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Members + mapping (stack) */}
          {members && (
            <div className="flex flex-wrap items-center gap-1">
              {members.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                  {m.templateName}: {m.name}
                  {isManuallyLinked(m) && (
                    <button type="button" onClick={() => onUnlink(m)} className="text-stone-400 hover:text-red-600" aria-label="Unlink field">
                      <IconUnlink size={11} />
                    </button>
                  )}
                </span>
              ))}
              <span className="relative">
                <button
                  type="button"
                  onClick={onLinkableClick}
                  aria-haspopup="listbox"
                  aria-expanded={linkPickerOpen}
                  className="inline-flex items-center gap-1 rounded border border-dashed border-stone-300 px-1.5 py-0.5 text-[11px] text-stone-500 hover:border-orange-400 hover:text-orange-700 dark:border-stone-600"
                >
                  <IconLink size={11} /> Merge another field
                </button>
                {linkPickerOpen && (
                  <LinkPickerPopup candidates={linkCandidates} onPick={onLink} onClose={onLinkableClick} />
                )}
              </span>
            </div>
          )}

          {/* Property editors */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600 dark:text-stone-300">
              Type
              <select value={field.type} onChange={(e) => onChange({ type: e.target.value })} className={fieldInputCls}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600 dark:text-stone-300">
              Default value
              <input
                value={field.defaultValue ?? ''}
                onChange={(e) => onChange({ defaultValue: e.target.value })}
                placeholder="Leave blank for no default"
                className={fieldInputCls}
              />
            </label>
            {field.type === 'dropdown' && (
              <label className="flex flex-col gap-1 text-xs font-medium text-stone-600 dark:text-stone-300 sm:col-span-2">
                Options (comma-separated)
                <input
                  value={optionsStr}
                  onChange={(e) => onChange({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className={fieldInputCls}
                  placeholder="Option A, Option B"
                />
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}
