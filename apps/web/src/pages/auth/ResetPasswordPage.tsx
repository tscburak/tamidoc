import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { IconLock } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, PasswordInput } from '../../components/ui';
import { PasswordStrengthMeter } from '../../components/auth/PasswordStrengthMeter';
import { authService } from '../../services/auth.service';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(8, 'Use at least 8 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type ResetPasswordForm = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(schema as any),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });

  const onSubmit = async (values: ResetPasswordForm) => {
    try {
      await authService.resetPassword(token, values.password);
      // Navigate to login after short delay
      setTimeout(() => {
        navigate('/login');
      }, 500);
    } catch (error) {
      // Error is handled by API interceptor and shown as toast
      // We don't need to do anything here
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Set a new password</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Choose a strong password you haven&apos;t used before.
        </p>
      </div>

      {!token && (
        <p className="text-sm text-orange-600 dark:text-orange-400">
          No reset token was found in the link. Please request a new password reset link.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <PasswordInput
            label="New password"
            placeholder="Create a password"
            autoComplete="new-password"
            leftSection={<IconLock size={18} />}
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthMeter value={password} />
        </div>

        <PasswordInput
          label="Confirm new password"
          placeholder="Re-enter your password"
          autoComplete="new-password"
          leftSection={<IconLock size={18} />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth size="md" loading={isSubmitting} disabled={!token}>
          {isSubmitting ? 'Resetting...' : 'Reset password'}
        </Button>
      </form>
    </div>
  );
}
