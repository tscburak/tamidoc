import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconCircleCheck, IconLock, IconClockOff, IconAlertTriangle } from '@tabler/icons-react';
import { Button, PasswordInput, Spinner } from '../../components/ui';
import { BrandLogo } from '../../components/brand/BrandLogo';
import {
  DynamicFormFields,
  initialValuesFor,
  findMissingFields,
  type FillValues,
} from '../../components/forms';
import type { TemplateField } from '../../context/TemplateStoreProvider';
import type { ComponentGroup } from '../../components/designer';
import { formsService, type PublicFormMeta } from '../../services/forms.service';

type Phase =
  | 'loading'
  | 'gate' // password required
  | 'form'
  | 'submitting'
  | 'success'
  | 'expired'
  | 'paused'
  | 'gone'; // not found

export function PublicFormFillPage() {
  const { formToken } = useParams<{ formToken: string }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [meta, setMeta] = useState<PublicFormMeta | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [values, setValues] = useState<FillValues>({});
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());

  const [password, setPassword] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadFields = async (token: string, pw?: string) => {
    const r = await formsService.getPublicFields(token, pw);
    setFields(r.fields);
    setGroups(r.groups);
    setValues(initialValuesFor(r.fields, r.groups));
    setMissingFields(new Set());
    setPhase('form');
  };

  // Load public metadata on mount.
  useEffect(() => {
    if (!formToken) {
      setPhase('gone');
      return;
    }
    (async () => {
      try {
        const m = await formsService.getPublicForm(formToken);
        setMeta(m);
        if (m.expired) return setPhase('expired');
        if (m.status !== 'active') return setPhase('paused');
        if (m.requiresPassword) return setPhase('gate');
        await loadFields(formToken);
      } catch (err: any) {
        setPhase(err?.response?.status === 410 ? 'expired' : 'gone');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formToken]);

  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formToken) return;
    setGateError(null);
    try {
      await loadFields(formToken, password);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) setGateError('Incorrect password. Please try again.');
      else if (status === 410) setPhase('expired');
      else setGateError('Unable to load this form. Please try again later.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formToken) return;
    const missing = findMissingFields(fields, groups, values);
    if (missing.length) {
      setMissingFields(new Set(missing));
      return;
    }
    setMissingFields(new Set());
    setSubmitError(null);
    setPhase('submitting');
    try {
      await formsService.submitPublicForm(
        formToken,
        values,
        meta?.requiresPassword ? password : undefined,
      );
      setPhase('success');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 410) return setPhase('expired');
      if (status === 403) return setPhase('paused');
      if (status === 422) {
        // Server re-checked required fields; surface generically.
        setPhase('form');
        setSubmitError('Some required fields are missing. Please complete them and try again.');
        return;
      }
      setPhase('form');
      setSubmitError('Something went wrong while submitting. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-stone-50 px-4 py-10 text-stone-800 sm:py-16 dark:bg-stone-900 dark:text-stone-100">
      <div className="w-full max-w-xl">
        {phase === 'loading' && (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        )}

        {phase === 'gate' && (
          <Card title={meta?.name ?? 'Protected form'} icon={<IconLock size={20} />}>
            <form onSubmit={handleGateSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                This form is password-protected. Enter the password to continue.
              </p>
              <PasswordInput
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
              />
              {gateError && <p className="text-xs font-medium text-red-600">{gateError}</p>}
              <Button type="submit" fullWidth>
                Continue
              </Button>
            </form>
          </Card>
        )}

        {(phase === 'form' || phase === 'submitting') && (
          <Card title={meta?.name ?? 'Form'} subtitle="Fill in the fields and submit when done.">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <DynamicFormFields
                fields={fields}
                groups={groups}
                values={values}
                onValuesChange={setValues}
                missingFields={missingFields}
                disabled={phase === 'submitting'}
              />
              {submitError && <p className="text-xs font-medium text-red-600">{submitError}</p>}
              <Button type="submit" fullWidth loading={phase === 'submitting'}>
                {phase === 'submitting' ? 'Submitting…' : 'Submit'}
              </Button>
            </form>
          </Card>
        )}

        {phase === 'success' && (
          <Card title="Thank you!" icon={<IconCircleCheck size={20} className="text-green-600" />}>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Your submission has been received{meta?.name ? ` for “${meta.name}”` : ''}. You may now close this window.
            </p>
          </Card>
        )}

        {phase === 'expired' && (
          <Card title="This form has expired" icon={<IconClockOff size={20} className="text-amber-600" />}>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              This form is no longer accepting submissions. Please contact the form owner if you think this is a mistake.
            </p>
          </Card>
        )}

        {phase === 'paused' && (
          <Card title="Form unavailable" icon={<IconAlertTriangle size={20} className="text-amber-600" />}>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              This form is currently not accepting submissions. Please try again later.
            </p>
          </Card>
        )}

        {phase === 'gone' && (
          <Card title="Form not found" icon={<IconAlertTriangle size={20} className="text-red-600" />}>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              This form link is invalid or has been removed.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-800">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <div>
          <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h1>
          {subtitle && <p className="text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>}
        </div>
      </div>
      {children}
      <p className="mt-6 flex items-center justify-center gap-1 text-[11px] text-stone-400">
        <BrandLogo className="h-3 w-auto" alt="" /> Powered by Tamidoc
      </p>
    </div>
  );
}
