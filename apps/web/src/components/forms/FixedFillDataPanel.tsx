import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { IconCopy, IconUpload } from '@tabler/icons-react';
import type { TemplateRecord } from '../../context/TemplateStoreProvider';
import { useToast } from '../../context/toast';
import { API_BASE_URL } from '../../lib/api';
import { Button, Tabs, TabsList, Tab, TabPanel } from '../ui';
import { DynamicFormFields, type FillValues } from './DynamicFormFields';
import { fixedFillEndpoint } from './fixedFillData';

export type FixedFillMode = 'form' | 'json' | 'api';

export function FixedFillDataPanel({
  template,
  organizationId,
  version,
  mode,
  onModeChange,
  values,
  onValuesChange,
  json,
  onJsonChange,
  jsonError,
  missingFields,
  generating,
  onGenerate,
}: {
  template: TemplateRecord;
  organizationId: string;
  version: string;
  mode: FixedFillMode;
  onModeChange: (mode: FixedFillMode) => void;
  values: FillValues;
  onValuesChange: (values: FillValues) => void;
  json: string;
  onJsonChange: (json: string) => void;
  jsonError?: string;
  missingFields: Set<string>;
  generating: boolean;
  onGenerate: () => void;
}) {
  const toast = useToast();
  const importRevision = useRef(0);
  // Discard a pending file read after another edit, a version switch, or unmount.
  useEffect(
    () => () => {
      importRevision.current += 1;
    },
    [json, version, generating],
  );
  const endpoint = fixedFillEndpoint(API_BASE_URL, organizationId, template.id);
  const payload = JSON.stringify(
    { values, ...(version ? { version } : {}) },
    null,
    2,
  );
  const curl = [
    `curl --fail-with-body --request POST '${endpoint.replace(/'/g, `'"'"'`)}' \\`,
    '  --header "Authorization: Bearer YOUR_API_KEY" \\',
    '  --header "Content-Type: application/json" \\',
    '  --data-binary @payload.json \\',
    '  --output document.pdf',
  ].join('\n');
  const javascript = `const response = await fetch(${JSON.stringify(endpoint)}, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${payload}),
});
if (!response.ok) throw new Error(await response.text());
const pdf = await response.blob();`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ title: 'Copied to clipboard', color: 'teal' });
    } catch {
      toast.show({
        title: 'Could not copy',
        message: 'Select the text and copy it manually.',
        color: 'red',
      });
    }
  };
  const codeSample = (title: string, text: string) => (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{title}</h4>
        <Button
          variant="subtle"
          size="xs"
          aria-label={`Copy ${title}`}
          onClick={() => void copy(text)}
          leftSection={<IconCopy size={14} />}
        >
          Copy
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-md border border-stone-200 bg-stone-50 p-3 text-xs dark:border-stone-700 dark:bg-stone-900">
        <code>{text}</code>
      </pre>
    </div>
  );

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onModeChange(value as FixedFillMode)}
    >
      <TabsList>
        <Tab value="form">Form</Tab>
        <Tab value="json">JSON</Tab>
        <Tab value="api">API</Tab>
      </TabsList>
      {jsonError && (
        <div
          role="alert"
          id="fill-json-error"
          className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"
        >
          <p>{jsonError}</p>
          <p className="mt-1">
            Fix the JSON to update the preview and download the PDF.
          </p>
          {mode !== 'json' && (
            <button
              type="button"
              className="mt-1 underline"
              onClick={() => onModeChange('json')}
            >
              Review JSON
            </button>
          )}
        </div>
      )}
      <TabPanel value="form">
        <DynamicFormFields
          fields={template.fields}
          groups={template.groups}
          values={values}
          onValuesChange={onValuesChange}
          missingFields={missingFields}
          disabled={generating || !!jsonError}
        />
      </TabPanel>
      <TabPanel value="json" className="space-y-3">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Use field names as keys and arrays of objects for repeating groups.
          All field values are strings, including numbers and checkboxes ("true"
          or "false"). Valid edits update the preview immediately.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="default"
            disabled={!!jsonError || generating}
            onClick={() => onJsonChange(JSON.stringify(values, null, 2))}
          >
            Format JSON
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => void copy(json)}
            leftSection={<IconCopy size={14} />}
          >
            Copy JSON
          </Button>
          <label className="relative inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-300">
            <IconUpload size={14} /> Import JSON
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Import JSON"
              disabled={generating}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const revision = ++importRevision.current;
                try {
                  const text = await file.text();
                  if (revision === importRevision.current) onJsonChange(text);
                } catch {
                  if (revision === importRevision.current)
                    toast.show({
                      title: 'Could not read JSON file',
                      color: 'red',
                    });
                }
              }}
            />
          </label>
          {jsonError && (
            <Button
              size="xs"
              variant="subtle"
              onClick={() => onValuesChange(values)}
            >
              Restore last valid JSON
            </Button>
          )}
        </div>
        <textarea
          aria-label="JSON fill values"
          aria-invalid={!!jsonError}
          aria-describedby={jsonError ? 'fill-json-error' : undefined}
          value={json}
          onChange={(event) => onJsonChange(event.target.value)}
          disabled={generating}
          spellCheck={false}
          rows={20}
          className="w-full resize-y rounded-md border border-stone-300 bg-white p-3 font-mono text-xs leading-5 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-stone-600 dark:bg-stone-900"
        />
      </TabPanel>
      <TabPanel value="api" className="space-y-4">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Generate this fixed template from your application. Use an organization API key with Generate PDFs permission. Requests return an application/pdf response.
        </p>
        <Link to={`/o/${organizationId}/org-settings?section=api-keys`} className="inline-block text-xs font-medium text-orange-700 underline dark:text-orange-400">Manage API keys</Link>
        {codeSample('POST endpoint', endpoint)}
        {codeSample('Request body', payload)}
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Save the request body as <code>payload.json</code> for cURL. Edit
          values in Form or JSON mode. Include required generation fields in API
          requests. Omit version to use the template's default version.
        </p>
        {codeSample('cURL (Bash)', curl)}
        {codeSample('JavaScript', javascript)}
        <Button
          onClick={onGenerate}
          disabled={generating || !!jsonError}
          loading={generating}
        >
          Send request &amp; download PDF
        </Button>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          The test request uses your signed-in session. Missing generation
          values are prompted before sending. Invalid values return HTTP 422
          with field errors.
        </p>
      </TabPanel>
      {mode !== 'form' && (
        <details className="mt-4 border-t border-stone-200 pt-3 text-xs dark:border-stone-700">
          <summary className="cursor-pointer font-semibold">
            Field reference
          </summary>
          <ul className="mt-2 space-y-2">
            {template.fields.map((field) => {
              const group = template.groups.find(
                (item) => item.id === field.groupId,
              );
              return (
                <li key={`${field.groupId ?? ''}:${field.name}`}>
                  <code>
                    {group ? `${group.name}[].` : ''}
                    {field.name}
                  </code>{' '}
                  — {field.type}
                  {field.required ? ', required' : ', optional'}
                  {field.askOnGenerate ? ', asked at generation' : ''}
                  {field.disabled ? ', read-only in form' : ''}
                  {field.visible === false ? ', hidden in form' : ''}
                  {field.options?.length
                    ? ` (${field.options.join(', ')})`
                    : ''}
                </li>
              );
            })}
            {template.fields.length === 0 && (
              <li>This template has no fields. Use an empty object: {'{}'}.</li>
            )}
          </ul>
        </details>
      )}
    </Tabs>
  );
}
