import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { IconLock, IconMail, IconUser } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { Button, TextInput, PasswordInput, Checkbox, Divider } from '../../components/ui';
import { OAuthButtons } from '../../components/auth/OAuthButtons';
import { PasswordStrengthMeter } from '../../components/auth/PasswordStrengthMeter';
import { useAuth } from '../../context/AuthContext';

const schema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().optional(),
    email: z
      .string()
      .min(1, 'Enter a valid email address')
      .email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(8, 'Use at least 8 characters'),
    terms: z.boolean().refine((v) => v === true, {
      message: 'Please accept the terms to continue',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type SignupForm = z.infer<typeof schema>;

export function SignupPage() {
  const { register: registerUser, isLoading } = useAuth();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: false,
    },
  });
  const password = useWatch({ control, name: 'password' });

  const onSubmit = async (values: SignupForm) => {
    try {
      await registerUser(
        values.firstName,
        values.lastName || '',
        values.email,
        values.password
      );
    } catch (error) {
      // Error is handled by API interceptor and shown as toast
      // We don't need to do anything here
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Create your account</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Start defining and filling documents in minutes.
        </p>
      </div>

      <OAuthButtons />

      <Divider label="or sign up with email" labelPosition="center" />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <TextInput
            label="First name"
            placeholder="Ada"
            leftSection={<IconUser size={18} />}
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextInput label="Last name" placeholder="Lovelace" {...register('lastName')} />
        </div>

        <TextInput
          label="Work email"
          placeholder="you@company.com"
          autoComplete="email"
          leftSection={<IconMail size={18} />}
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="flex flex-col gap-1.5">
          <PasswordInput
            label="Password"
            placeholder="Create a password"
            autoComplete="new-password"
            leftSection={<IconLock size={18} />}
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthMeter value={password} />
        </div>

        <PasswordInput
          label="Confirm password"
          placeholder="Re-enter your password"
          autoComplete="new-password"
          leftSection={<IconLock size={18} />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Checkbox
          label={
            <span className="text-sm text-stone-700 dark:text-stone-200">
              I agree to the{' '}
              <Link to="/" className="font-medium text-orange-600 hover:text-orange-700">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/" className="font-medium text-orange-600 hover:text-orange-700">
                Privacy Policy
              </Link>
              .
            </span>
          }
          error={errors.terms?.message}
          {...register('terms')}
        />

        <Button type="submit" fullWidth size="md" loading={isLoading}>
          {isLoading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-stone-500 dark:text-stone-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-orange-600 hover:text-orange-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
