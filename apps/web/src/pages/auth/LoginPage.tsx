import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { IconLock, IconMail } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { Button, TextInput, PasswordInput, Checkbox, Divider } from '../../components/ui';
import { OAuthButtons } from '../../components/auth/OAuthButtons';
import { useAuth } from '../../context/AuthContext';

const schema = z.object({
  email: z
    .string()
    .min(1, 'Enter a valid email address')
    .email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const { login, isLoading } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema as any),
    defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = async (values: LoginForm) => {
    try {
      await login(values.email, values.password);
    } catch (error) {
      // Error is handled by API interceptor and shown as toast
      // We don't need to do anything here
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Welcome back</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Sign in to your tamidoc workspace to continue.
        </p>
      </div>

      <OAuthButtons />

      <Divider label="or continue with email" labelPosition="center" />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <TextInput
          label="Email"
          placeholder="you@company.com"
          autoComplete="email"
          leftSection={<IconMail size={18} />}
          error={errors.email?.message}
          {...register('email')}
        />

        <PasswordInput
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          leftSection={<IconLock size={18} />}
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between gap-3">
          <Checkbox label="Remember me" {...register('remember')} />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="md" loading={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm text-stone-500 dark:text-stone-400">
        Don&apos;t have an account?{' '}
        <Link to="/signup" className="font-semibold text-orange-600 hover:text-orange-700">
          Create one
        </Link>
      </p>
    </div>
  );
}
