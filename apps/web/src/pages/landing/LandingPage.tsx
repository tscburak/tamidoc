import { useEffect, useState } from 'react';
import {
  IconArrowRight,
  IconApi,
  IconBrain,
  IconBriefcase,
  IconCheck,
  IconClipboardText,
  IconCloud,
  IconCode,
  IconDeviceDesktop,
  IconEye,
  IconFileCheck,
  IconFileTypePdf,
  IconFileUpload,
  IconHistory,
  IconHome,
  IconLock,
  IconMoon,
  IconReceipt,
  IconRobot,
  IconScale,
  IconShield,
  IconSparkles,
  IconSun,
  IconTemplate,
  IconUser,
  IconUsers,
  IconWriting,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useColorScheme } from '../../context/color-scheme';
import { Badge, TextInput, ThemeIcon, buttonClasses } from '../../components/ui';
import type { Color } from '../../components/ui/colors';
import { BrandLogo } from '../../components/brand/BrandLogo';

// ---------------------------------------------------------------------------
// Content. Keep declarative so copy changes don't require touching JSX.
// ---------------------------------------------------------------------------

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Outputs', href: '#outputs' },
  { label: 'How it works', href: '#how' },
  { label: 'Use cases', href: '#use-cases' },
];

const stats = [
  { value: '4', label: 'Ways to fill' },
  { value: '6', label: 'Field types' },
  { value: '1', label: 'Source of truth' },
  { value: 'BYO', label: 'Storage' },
];

// Accent rotation for feature cards — visual rhythm across the grid.
const featureAccent: Color[] = ['orange', 'teal', 'amber', 'teal', 'orange', 'amber'];

const features = [
  {
    icon: IconTemplate,
    title: 'Template-driven',
    desc: 'Define each document once — layout, form fields, and JSON schema live together in one template.',
  },
  {
    icon: IconBrain,
    title: 'AI PDF import',
    desc: 'Upload an existing PDF and let AI extract fields into a ready-to-use template in seconds.',
  },
  {
    icon: IconHistory,
    title: 'Full versioning',
    desc: 'Every template is versioned. Older documents stay intact as fields evolve over time.',
  },
  {
    icon: IconDeviceDesktop,
    title: 'Fill four ways',
    desc: 'Form UI, raw JSON, REST API, or AI agents — the same template serves any consumer.',
  },
  {
    icon: IconCloud,
    title: 'Flexible storage',
    desc: 'Platform cloud by default, or connect your own Drive, S3, SharePoint, or MinIO.',
  },
  {
    icon: IconLock,
    title: 'Built for teams',
    desc: 'Enterprise access controls, API keys, and customer-managed storage from day one.',
  },
];

// One template → every output. The core infrastructure pitch.
const outputs = [
  {
    icon: IconClipboardText,
    label: 'Form UI',
    desc: 'Guided web form for humans.',
    color: 'orange' as Color,
  },
  {
    icon: IconApi,
    label: 'REST API',
    desc: 'Generate documents from any backend.',
    color: 'teal' as Color,
  },
  {
    icon: IconFileTypePdf,
    label: 'PDF',
    desc: 'Print-ready, versioned output.',
    color: 'amber' as Color,
  },
  {
    icon: IconRobot,
    label: 'AI agent',
    desc: 'MCP tools discover and fill automatically.',
    color: 'teal' as Color,
  },
];

const steps = [
  {
    icon: IconFileUpload,
    title: 'Upload your PDF',
    desc: 'Drop an existing form or contract. No need to rebuild anything from scratch.',
  },
  {
    icon: IconSparkles,
    title: 'AI extracts fields',
    desc: 'Text, dates, numbers, checkboxes, signatures, and dropdowns are detected automatically.',
  },
  {
    icon: IconFileCheck,
    title: 'Fill & generate',
    desc: 'Fill via form, API, or AI, then export a finished, versioned document every time.',
  },
];

const useCases = [
  { icon: IconUsers, title: 'Human Resources', desc: 'Onboarding, leave, and performance forms.' },
  { icon: IconScale, title: 'Legal', desc: 'Contracts, waivers, and undertakings.' },
  { icon: IconReceipt, title: 'Accounting & Finance', desc: 'Quotes, collections, and internal forms.' },
  { icon: IconShield, title: 'Insurance', desc: 'Applications and claim documents.' },
  { icon: IconHome, title: 'Real Estate', desc: 'Lease agreements and delivery receipts.' },
  { icon: IconBriefcase, title: 'Consulting', desc: 'Reports and evaluation forms.' },
];

const footerCols = [
  { title: 'Product', links: ['Templates', 'Documents', 'PDF Import', 'Pricing'] },
  { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
  { title: 'Resources', links: ['Documentation', 'API Reference', 'Status', 'Changelog'] },
  { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'DPA'] },
];

// Sample names cycled by the hero auto-type demo.
const SAMPLE_NAMES = ['Alex Morgan', 'Jordan Lee', 'Sam Rivera'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function LandingPage() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Hero live-preview demo: auto-type sample names until the user focuses the
  // field, then hand control over to them.
  const [employeeName, setEmployeeName] = useState('');
  const [autoType, setAutoType] = useState(true);

  useEffect(() => {
    if (!autoType) return;
    let i = 0;
    let idx = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = SAMPLE_NAMES[idx];
      if (!deleting) {
        i += 1;
        setEmployeeName(full.slice(0, i));
        if (i >= full.length) {
          deleting = true;
          timer = setTimeout(tick, 1900);
          return;
        }
        timer = setTimeout(tick, 85);
      } else {
        i -= 1;
        setEmployeeName(full.slice(0, i));
        if (i <= 0) {
          deleting = false;
          idx = (idx + 1) % SAMPLE_NAMES.length;
          timer = setTimeout(tick, 450);
          return;
        }
        timer = setTimeout(tick, 38);
      }
    };
    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, [autoType]);

  const displayName = employeeName.trim();
  // Renders the bound name token — highlighted when filled, placeholder when empty.
  const renderName = () =>
    displayName ? (
      <span className="font-semibold text-orange-600 transition-colors dark:text-orange-500">
        {displayName}
      </span>
    ) : (
      <span className="rounded bg-stone-200 px-1 font-mono text-[0.8em] text-stone-400 dark:bg-stone-700 dark:text-stone-500">
        {'{{name}}'}
      </span>
    );

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 dark:bg-stone-950 dark:text-stone-200">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur dark:border-stone-800 dark:bg-stone-950/80">
        <div className="td-container flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 no-underline">
              <BrandLogo className="h-7 w-auto" />
              <span className="text-lg font-extrabold tracking-tight text-stone-800 dark:text-stone-100">
                tamidoc
              </span>
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              {navLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-sm text-stone-500 no-underline transition-colors hover:text-stone-800 dark:hover:text-stone-100"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleColorScheme}
              aria-label="Toggle color scheme"
              className={buttonClasses({ variant: 'subtle', color: 'gray', size: 'sm' })}
            >
              {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
            <Link to="/login" className={buttonClasses({ variant: 'subtle', size: 'sm' })}>
              Sign in
            </Link>
            <Link to="/signup" className={buttonClasses({ size: 'sm' })}>
              Get started
              <IconArrowRight size={16} className="ml-2" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Backdrop: dot grid + brand glow */}
          <div
            aria-hidden
            className="td-bg-dots pointer-events-none absolute inset-0 text-stone-200/60 dark:text-stone-800/60"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(233,163,25,0.12),transparent_42%),radial-gradient(circle_at_82%_8%,rgba(47,107,95,0.12),transparent_46%)]"
          />

          <div className="td-container relative py-14 md:py-22">
            {/* Hero copy — centered */}
            <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
                Document <span className="td-text-gradient">infrastructure</span> for your whole stack
              </h1>

              <p className="max-w-[560px] text-lg text-stone-500 dark:text-stone-400">
                Design a document once, then use it everywhere — as a form, API, PDF, or AI tool.
                Versioned, reliable, and ready for every consumer.
              </p>

              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/signup" className={buttonClasses({ size: 'lg' })}>
                  Start free trial
                  <IconArrowRight size={18} className="ml-2" />
                </Link>
                <a href="#how" className={buttonClasses({ variant: 'default', size: 'lg' })}>
                  See how it works
                </a>
              </div>

              <div className="flex flex-wrap justify-center gap-5">
                {['No credit card', 'Import your first PDF in minutes'].map((item) => (
                  <div key={item} className="flex items-center gap-1.5">
                    <IconCheck size={16} className="text-teal-600" />
                    <span className="text-sm text-stone-500 dark:text-stone-400">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Form ↔ Live preview dual panel */}
            <div className="relative mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
              {/* Form panel */}
              <div className="td-card flex flex-col rounded-lg border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThemeIcon color="orange" variant="light" size={36} radius="md">
                      <IconWriting size={20} />
                    </ThemeIcon>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100">Form</span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        Employment Agreement · v2
                      </span>
                    </div>
                  </div>
                  <Badge color="orange" variant="light">1 variable</Badge>
                </div>

                <div className="flex flex-col gap-3">
                  <TextInput
                    label="Employee name"
                    value={employeeName}
                    placeholder="Type a name…"
                    leftSection={<IconUser size={16} />}
                    onFocus={() => setAutoType(false)}
                    onChange={(e) => setEmployeeName(e.target.value)}
                  />
                  <TextInput label="Position" defaultValue="Senior Engineer" readOnly />
                  <TextInput label="Start date" defaultValue="Sep 1, 2026" readOnly />
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <IconCheck size={14} className="text-teal-600" />
                  Bound to{' '}
                  <code className="rounded bg-stone-100 px-1 font-mono text-[0.8em] dark:bg-stone-800">
                    {'{{name}}'}
                  </code>{' '}
                  in the preview
                </div>
              </div>

              {/* Connector arrow (desktop only) */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex"
              >
                <span className="flex size-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
                  <IconArrowRight size={18} />
                </span>
              </div>

              {/* Preview panel */}
              <div className="flex flex-col rounded-lg border border-stone-200 bg-stone-50 p-5 shadow-sm dark:border-stone-800 dark:bg-stone-950">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThemeIcon color="teal" variant="light" size={36} radius="md">
                      <IconEye size={20} />
                    </ThemeIcon>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100">
                        Live preview
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        Updates as you type
                      </span>
                    </div>
                  </div>
                  <Badge color="teal" variant="light">
                    <span className="mr-1 inline-block size-1.5 rounded-full bg-teal-500" />
                    Live
                  </Badge>
                </div>

                {/* Document body */}
                <div className="rounded-md bg-white p-4 text-sm leading-relaxed text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                  <p className="mb-2 font-bold text-stone-800 dark:text-stone-100">
                    Employment Agreement
                  </p>
                  <p className="mb-3">
                    This Employment Agreement is entered into between Acme Inc. (the
                    &ldquo;Company&rdquo;) and {renderName()} (the &ldquo;Employee&rdquo;).
                  </p>
                  <p>
                    The Company hereby employs {renderName()} as Senior Engineer beginning Sep 1,
                    2026, subject to the terms and conditions set forth herein.
                  </p>
                </div>
              </div>
            </div>

            {/* Stats band */}
            <div className="mt-12 rounded-lg border border-stone-200 bg-white p-6 md:mt-18 md:p-8 dark:border-stone-800 dark:bg-stone-900">
              <div className="flex flex-wrap items-center justify-around gap-6">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col items-center text-center">
                    <span className="text-2xl font-extrabold text-orange-600 md:text-3xl">
                      {stat.value}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="td-section">
          <div className="td-container">
            <div className="mx-auto mb-8 flex max-w-[620px] flex-col items-center gap-1 text-center md:mb-12">
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                One template, everywhere it&apos;s used
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Stop maintaining the same document as a PDF, a Word file, a form, and an API payload.
                Define it once.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((item, idx) => (
                <div
                  key={item.title}
                  className="td-card flex h-full flex-col gap-3 rounded-md border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
                >
                  <ThemeIcon size={42} radius="md" variant="light" color={featureAccent[idx]}>
                    <item.icon size={22} />
                  </ThemeIcon>
                  <span className="text-lg font-bold text-stone-800 dark:text-stone-100">
                    {item.title}
                  </span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* One template, every output */}
        <section id="outputs" className="td-section bg-stone-100 dark:bg-stone-900">
          <div className="td-container">
            <div className="mx-auto mb-10 flex max-w-[620px] flex-col items-center gap-1 text-center md:mb-14">
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                Design once. Use everywhere.
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                The same template fills through whatever interface your workflow needs — no
                integrations to rebuild per channel.
              </p>
            </div>

            {/* Source → outputs diagram */}
            <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-center">
              {/* Source */}
              <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-5 lg:w-64 dark:border-stone-800 dark:bg-stone-950">
                <ThemeIcon size={44} radius="md" variant="filled" color="orange">
                  <IconTemplate size={24} />
                </ThemeIcon>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-stone-800 dark:text-stone-100">
                    Template
                  </span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    Single source of truth
                  </span>
                </div>
              </div>

              {/* Connector */}
              <div
                aria-hidden
                className="mx-auto h-px w-2/3 bg-gradient-to-r from-orange-300 to-teal-300 lg:h-12 lg:w-16 lg:bg-gradient-to-b dark:from-orange-700 dark:to-teal-700"
              />

              {/* Outputs */}
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                {outputs.map((out) => (
                  <div
                    key={out.label}
                    className="td-card flex items-center gap-3 rounded-md border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950"
                  >
                    <ThemeIcon size={40} radius="md" variant="light" color={out.color}>
                      <out.icon size={22} />
                    </ThemeIcon>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100">
                        {out.label}
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">{out.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="td-section">
          <div className="td-container">
            <div className="mx-auto mb-8 flex max-w-[620px] flex-col items-center gap-1 text-center md:mb-12">
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                From PDF to live template in three steps
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {steps.map((step, idx) => (
                <div
                  key={step.title}
                  className="flex flex-col gap-3 rounded-md border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="flex items-start justify-between">
                    <ThemeIcon size={42} radius="md" variant="light" color="orange">
                      <step.icon size={22} />
                    </ThemeIcon>
                    <span className="text-2xl font-extrabold text-stone-300 dark:text-stone-700">
                      {idx + 1}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-stone-800 dark:text-stone-100">
                    {step.title}
                  </span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">{step.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section id="use-cases" className="td-section bg-stone-100 dark:bg-stone-900">
          <div className="td-container">
            <div className="mx-auto mb-8 flex max-w-[620px] flex-col items-center gap-1 text-center md:mb-12">
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                Built for document-heavy teams
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Wherever forms, contracts, and records pile up, tamidoc keeps them in one place.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {useCases.map((item) => (
                <div
                  key={item.title}
                  className="td-card flex items-start gap-3 rounded-md border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950"
                >
                  <ThemeIcon size={38} radius="md" variant="light" color="teal">
                    <item.icon size={20} />
                  </ThemeIcon>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-stone-800 dark:text-stone-100">
                      {item.title}
                    </span>
                    <span className="text-sm text-stone-500 dark:text-stone-400">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="td-section">
          <div className="td-container">
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-teal-700 via-teal-600 to-orange-600 p-8 text-center text-white md:p-14">
              {/* Dot overlay */}
              <div
                aria-hidden
                className="td-bg-dots pointer-events-none absolute inset-0 text-white/10"
              />
              <div className="relative flex flex-col items-center gap-6">
                <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                  Start defining documents today
                </h2>
                <p className="max-w-[540px] text-base opacity-90">
                  Import your first PDF and have a reusable, fillable template in minutes. No setup,
                  no migration.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link to="/signup" className={buttonClasses({ color: 'orange', size: 'lg' })}>
                    Create free account
                    <IconArrowRight size={18} className="ml-2" />
                  </Link>
                  <Link
                    to="/login"
                    className={buttonClasses({ variant: 'white', color: 'teal', size: 'lg' })}
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-800">
        <div className="td-container py-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-12 md:gap-12">
            <div className="col-span-2 flex flex-col gap-2 md:col-span-4">
              <div className="flex items-center gap-2">
                <BrandLogo className="h-7 w-auto" />
                <span className="text-lg font-extrabold tracking-tight">tamidoc</span>
              </div>
              <span className="max-w-[280px] text-sm text-stone-500 dark:text-stone-400">
                Document infrastructure for modern teams. Define once, fill everywhere.
              </span>
            </div>
            {footerCols.map((col) => (
              <div key={col.title} className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-sm font-bold">{col.title}</span>
                {col.links.map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="text-sm text-stone-500 no-underline transition-colors hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
                  >
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-5 dark:border-stone-800">
            <span className="text-xs text-stone-500 dark:text-stone-400">
              © 2026 tamidoc. All rights reserved.
            </span>
            <div className="flex items-center gap-1.5">
              <IconCode size={14} className="text-orange-600" />
              <span className="text-xs text-stone-500 dark:text-stone-400">
                Document Infrastructure Platform
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
