import { IconArrowLeft, IconMailOpened } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { Button, ThemeIcon } from '../../components/ui';
import { useToast } from '../../context/toast';

interface CheckEmailState {
  email?: string;
  type?: 'verify' | 'reset';
}

export function CheckEmailPage() {
  const { state } = useLocation();
  const { email, type } = (state as CheckEmailState) ?? {};
  const isReset = type === 'reset';
  const toast = useToast();

  const resend = () =>
    toast.show({
      title: 'Link resent',
      message: email ? `We sent another link to ${email} (mock).` : 'We sent another link (mock).',
      color: 'teal',
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <ThemeIcon
          size={56}
          radius="xl"
          variant="light"
          color="teal"
          className="shadow-sm ring-1 ring-stone-200 dark:ring-stone-700"
        >
          <IconMailOpened size={28} />
        </ThemeIcon>
      </div>

      <div className="flex flex-col items-center gap-1">
        <h2 className="text-center text-2xl font-bold text-stone-800 dark:text-stone-100">
          {isReset ? 'Check your inbox' : 'Verify your email'}
        </h2>
        <p className="max-w-md text-center text-sm text-stone-500 dark:text-stone-400">
          {email ? (
            <>
              We sent a {isReset ? 'password reset link' : 'verification link'} to{' '}
              <span className="font-semibold text-stone-800 dark:text-stone-100">{email}</span>.
            </>
          ) : (
            <>We sent a {isReset ? 'password reset link' : 'verification link'} to your email address.</>
          )}{' '}
          Follow the link to {isReset ? 'set a new password' : 'activate your account'}.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button variant="subtle" onClick={resend} size="sm">
          Resend email
        </Button>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Didn&apos;t get it? Check your spam folder.
        </p>
      </div>

      <Link
        to="/login"
        className="inline-flex items-center justify-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <IconArrowLeft size={14} />
        Back to sign in
      </Link>
    </div>
  );
}
