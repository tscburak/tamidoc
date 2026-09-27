import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { IconArrowLeft, IconMail } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { Button, TextInput } from '../../components/ui';
import { authService } from '../../services/auth.service';

const schema = z.object({
  email: z
    .string()
    .min(1, 'Enter a valid email address')
    .email('Enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema as any),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordForm) => {
    try {
      await authService.forgotPassword(values.email);
      // Navigate to check email page after success
      setTimeout(() => {
        window.location.href = '/check-email';
      }, 500);
    } catch (error) {
      // Error is handled by API interceptor and shown as toast
      // We don't need to do anything here
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Forgot password?</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Enter the email associated with your account and we&apos;ll send you a link to reset your
          password.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <TextInput
          label="Email"
          placeholder="you@company.com"
          autoComplete="email"
          leftSection={<IconMail size={18} />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" fullWidth size="md" loading={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <IconArrowLeft size={14} />
        Back to sign in
      </Link>
    </div>
  );
}
