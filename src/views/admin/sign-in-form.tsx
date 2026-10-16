import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import type { Enrolment, SignInStep } from '@/server/auth/flow';

type Step = SignInStep | 'loading';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'The email or password is wrong.',
  rate_limited: 'Too many attempts. Wait a few minutes, then try again.',
  invalid_code: 'That code didn’t work. Codes change every 30 seconds; try the current one.',
  forbidden: 'This account can’t use the admin.',
  expired: 'You were signed out after 12 hours without activity.',
  unauthenticated: 'Sign in again to continue.',
  failed: 'Something went wrong. Try again.',
};

/** Two-step sign-in (03 ADM-01): email + password, then a 6-digit code from an authenticator app. */
export function SignInForm({ onDone, reason }: { onDone: () => void; reason?: string }) {
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState(reason && MESSAGES[reason] ? MESSAGES[reason] : '');
  const [busy, setBusy] = useState(false);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    api<{ step?: SignInStep }>('/api/auth/status').then(({ data }) => setStep(data.step ?? 'password'));
  }, []);

  useEffect(() => {
    if (step === 'done') onDone();
    if (step === 'enroll' && !enrolment) {
      api<Enrolment>('/api/auth/mfa/enroll', { method: 'POST' }).then(({ status, data }) => {
        if (status === 200) setEnrolment(data);
        else setStep('password');
      });
    }
    // Move focus to the new step's heading, so screen readers announce it.
    heading.current?.focus();
  }, [step, enrolment, onDone]);

  async function submit(e: FormEvent<HTMLFormElement>, run: (form: FormData) => Promise<void>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await run(new FormData(e.currentTarget));
    } catch {
      setError(MESSAGES.failed!);
    } finally {
      setBusy(false);
    }
  }

  const password = (form: FormData) =>
    api<{ step?: SignInStep; error?: string }>('/api/auth/sign-in', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    }).then(({ data }) => {
      if (data.step) setStep(data.step);
      else setError(MESSAGES[data.error ?? 'failed'] ?? MESSAGES.failed!);
    });

  const code = (form: FormData) =>
    api<{ ok?: boolean; error?: string }>('/api/auth/mfa/verify', {
      method: 'POST',
      body: { code: String(form.get('code') ?? '').replace(/\s/g, '') },
    }).then(({ data }) => {
      if (data.ok) return setStep('done');
      setError(MESSAGES[data.error ?? 'failed'] ?? MESSAGES.failed!);
      if (data.error === 'forbidden' || data.error === 'unauthenticated') {
        setEnrolment(null);
        setStep('password');
      }
    });

  const alert = error ? (
    <p className="adm-error" role="alert">
      {error}
    </p>
  ) : null;

  if (step === 'loading' || step === 'done') return <p aria-live="polite">Checking your session…</p>;

  if (step === 'password') {
    return (
      // Keyed per step: React must not reuse the password <input> for the code (it would show the password).
      <form key="password" className="adm-form" onSubmit={(e) => submit(e, password)}>
        <h1 ref={heading} tabIndex={-1}>
          Sign in
        </h1>
        {alert}
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn pri" type="submit" disabled={busy}>
          Continue
        </button>
      </form>
    );
  }

  return (
    <form key={step} className="adm-form" onSubmit={(e) => submit(e, code)}>
      <h1 ref={heading} tabIndex={-1}>
        {step === 'enroll' ? 'Set up two-step sign-in' : 'Enter your code'}
      </h1>
      {alert}
      {step === 'enroll' ? (
        enrolment ? (
          <>
            <p>
              <strong>1.</strong> In an authenticator app (for example Google Authenticator or 1Password), add an
              account by scanning this QR code.
            </p>
            <img
              className="adm-qr"
              src={enrolment.qr}
              alt="QR code for your authenticator app"
              width={200}
              height={200}
            />
            <p>
              Can’t scan it? Type this setup key <em>into the app</em> instead:{' '}
              <code className="adm-secret">{enrolment.secret}</code>
            </p>
            <p>
              <strong>2.</strong> The app then shows a 6-digit code that changes every 30 seconds. Enter that code
              below.
            </p>
          </>
        ) : (
          <p aria-live="polite">Preparing your QR code…</p>
        )
      ) : (
        <p>Open your authenticator app and enter the 6-digit code for CodingSpace.</p>
      )}
      <label>
        6-digit code
        <input
          aria-describedby="code-hint"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          title="The 6-digit code from your authenticator app"
          maxLength={7}
          required
        />
      </label>
      <span className="adm-hint" id="code-hint">
        Numbers only, from your app — not the setup key.
      </span>
      <button className="btn pri" type="submit" disabled={busy || (step === 'enroll' && !enrolment)}>
        Verify
      </button>
    </form>
  );
}
