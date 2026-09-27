// ---------------------------------------------------------------------------
// Shared color class maps.
//
// Tailwind's JIT compiler only generates classes it can see as complete
// literal strings, so every utility used dynamically must appear here in full
// (no string interpolation). Components compose these maps instead of building
// `bg-${color}-600`-style strings.
//
// `orange`, `amber`, `teal` are the brand colors overridden in index.css
// (orange-600 == #C65D2E). The rest use Tailwind defaults. Neutrals are `stone`.
// ---------------------------------------------------------------------------

export type Color = 'orange' | 'teal' | 'red' | 'amber' | 'blue' | 'green' | 'gray' | 'stone';

/** Solid fill + white text, with hover darken. For filled buttons. */
export const solidBg: Record<Color, string> = {
  orange: 'bg-orange-600 text-white hover:bg-orange-700',
  teal: 'bg-teal-600 text-white hover:bg-teal-700',
  red: 'bg-red-600 text-white hover:bg-red-700',
  amber: 'bg-amber-500 text-white hover:bg-amber-600',
  blue: 'bg-blue-600 text-white hover:bg-blue-700',
  green: 'bg-green-600 text-white hover:bg-green-700',
  gray: 'bg-stone-600 text-white hover:bg-stone-700',
  stone: 'bg-stone-700 text-white hover:bg-stone-800',
};

/** Tinted background + colored text, with hover. For light buttons/badges. */
export const softBg: Record<Color, string> = {
  orange: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
  teal: 'bg-teal-50 text-teal-700 hover:bg-teal-100',
  red: 'bg-red-50 text-red-700 hover:bg-red-100',
  amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  green: 'bg-green-50 text-green-700 hover:bg-green-100',
  gray: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
  stone: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
};

/** Transparent with colored text + subtle hover fill. For subtle buttons. */
export const textHover: Record<Color, string> = {
  orange: 'text-orange-700 hover:bg-orange-50',
  teal: 'text-teal-700 hover:bg-teal-50',
  red: 'text-red-600 hover:bg-red-50',
  amber: 'text-amber-700 hover:bg-amber-50',
  blue: 'text-blue-700 hover:bg-blue-50',
  green: 'text-green-700 hover:bg-green-50',
  gray: 'text-stone-600 hover:bg-stone-100',
  stone: 'text-stone-600 hover:bg-stone-100',
};

/** Tinted background + colored text, no hover. For badges / light theme icons. */
export const softTint: Record<Color, string> = {
  orange: 'bg-orange-50 text-orange-600',
  teal: 'bg-teal-50 text-teal-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  gray: 'bg-stone-100 text-stone-600',
  stone: 'bg-stone-100 text-stone-600',
};

/** Solid background only (no text/hover). For progress bars, avatars, fills. */
export const solidFill: Record<Color, string> = {
  orange: 'bg-orange-600',
  teal: 'bg-teal-600',
  red: 'bg-red-600',
  amber: 'bg-amber-500',
  blue: 'bg-blue-600',
  green: 'bg-green-600',
  gray: 'bg-stone-500',
  stone: 'bg-stone-600',
};

/** Solid fill + white text, no hover. For filled badges / theme icons. */
export const solidText: Record<Color, string> = {
  orange: 'bg-orange-600 text-white',
  teal: 'bg-teal-600 text-white',
  red: 'bg-red-600 text-white',
  amber: 'bg-amber-500 text-white',
  blue: 'bg-blue-600 text-white',
  green: 'bg-green-600 text-white',
  gray: 'bg-stone-600 text-white',
  stone: 'bg-stone-700 text-white',
};

/** Text color only. */
export const textColor: Record<Color, string> = {
  orange: 'text-orange-600',
  teal: 'text-teal-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
  green: 'text-green-600',
  gray: 'text-stone-500',
  stone: 'text-stone-600',
};

/** Left accent border (4px). For accent cards. */
export const accentBorder: Record<Color, string> = {
  orange: 'border-l-orange-600',
  teal: 'border-l-teal-600',
  red: 'border-l-red-600',
  amber: 'border-l-amber-500',
  blue: 'border-l-blue-600',
  green: 'border-l-green-600',
  gray: 'border-l-stone-400',
  stone: 'border-l-stone-500',
};
