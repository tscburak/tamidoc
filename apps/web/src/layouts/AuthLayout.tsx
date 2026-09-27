import { IconCheck } from '@tabler/icons-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ThemeIcon } from '../components/ui';
import { BrandLogo } from '../components/brand/BrandLogo';

// Value props shown on the brand panel. Keep these aligned with product capabilities.
const highlights = [
  'Define once — use in forms, JSON, API, or AI agents',
  'Versioned templates that never break existing documents',
  'Import existing PDFs and auto-extract their fields',
  'Bring your own storage: Drive, S3, SharePoint and more',
];

export function AuthLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-row">
      {/* Brand showcase — hidden on small screens. */}
      <div className="relative hidden w-[440px] shrink-0 overflow-hidden bg-gradient-to-br from-teal-800 via-teal-600 to-teal-700 p-12 text-white md:block lg:w-[520px] lg:p-12">
        {/* Decorative glow. */}
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-amber-500/20 blur-md" />

        <span
          className="relative flex cursor-pointer items-center gap-2 text-xl font-extrabold tracking-tight"
          onClick={() => navigate('/')}
        >
          <BrandLogo variant="white" className="h-7 w-auto" alt="" />
          tamidoc
        </span>

        <div className="relative mt-24 flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <p className="text-xl font-bold leading-snug">
              Document infrastructure for modern teams.
            </p>
            <p className="text-sm opacity-85">
              One source of truth for every document — versioned, fillable, and ready for humans,
              apps, and AI.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {highlights.map((item) => (
              <div key={item} className="flex flex-row items-start gap-2">
                <ThemeIcon size={20} radius="xl" variant="white" color="teal" className="mb-1.5">
                  <IconCheck size={12} />
                </ThemeIcon>
                <span className="text-sm opacity-95">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form area. */}
      <div className="flex flex-1 flex-col bg-stone-50 dark:bg-stone-900">
        <div className="mx-auto my-auto w-full max-w-sm px-5 py-10 sm:px-8 md:py-10">
          {/* Mobile-only wordmark (brand panel is hidden below md). */}
          <span
            className="mb-6 flex cursor-pointer items-center justify-center gap-2 text-center text-xl font-extrabold tracking-tight md:hidden"
            onClick={() => navigate('/')}
          >
            <BrandLogo variant="color" className="h-7 w-auto" alt="" />
            tamidoc
          </span>

          <Outlet />
        </div>
      </div>
    </div>
  );
}
