import { Progress, type Color } from '../ui';

// Crude but readable strength scoring for mockups. Not a security barrier —
// the real rules live on the backend.
function scorePassword(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const COLORS: Color[] = ['gray', 'red', 'orange', 'amber', 'teal'];

export function PasswordStrengthMeter({ value }: { value: string }) {
  const score = scorePassword(value);

  return (
    <div className="flex items-center justify-between gap-3">
      <Progress value={(score / 4) * 100} color={COLORS[score]} size="xs" className="flex-1" />
      <span className="whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">
        {value ? LABELS[score] : 'Use 8+ characters'}
      </span>
    </div>
  );
}
