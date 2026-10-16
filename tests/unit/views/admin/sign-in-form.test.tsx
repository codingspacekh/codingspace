import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from '@/views/admin/sign-in-form';

type Reply = [status: number, body: unknown];

/** Answers fetch() by path; records each request body. */
function mockApi(routes: Record<string, Reply | Reply[]>) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[path];
      if (!route) throw new Error(`unexpected ${path}`);
      const [status, body] = (Array.isArray(route[0]) ? (route as Reply[]).shift() : route) as Reply;
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SignInForm', () => {
  it('password, then the 6-digit code, then done', async () => {
    const calls = mockApi({
      '/api/auth/status': [200, { step: 'password' }],
      '/api/auth/sign-in': [200, { step: 'verify' }],
      '/api/auth/mfa/verify': [200, { ok: true }],
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<SignInForm onDone={onDone} />);

    await user.type(await screen.findByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toHaveFocus();
    // A fresh, empty field: never the password typed a moment ago.
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
    await user.type(screen.getByLabelText('6-digit code'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.find((c) => c.path === '/api/auth/sign-in')!.body).toEqual({
      email: 'owner@example.test',
      password: 'secret',
    });
    expect(calls.find((c) => c.path === '/api/auth/mfa/verify')!.body).toEqual({ code: '123456' });
  });

  it('says when the password is wrong, and stays on the password step', async () => {
    mockApi({
      '/api/auth/status': [200, { step: 'password' }],
      '/api/auth/sign-in': [401, { error: 'invalid_credentials' }],
    });
    const user = userEvent.setup();
    render(<SignInForm onDone={vi.fn()} />);
    await user.type(await screen.findByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is wrong.');
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('first sign-in shows the QR code and the key for an authenticator app', async () => {
    mockApi({
      '/api/auth/status': [200, { step: 'enroll' }],
      '/api/auth/mfa/enroll': [200, { factorId: 'f', qr: 'data:image/svg+xml;utf-8,%3Csvg%2F%3E', secret: 'JBSWY3DP' }],
      '/api/auth/mfa/verify': [400, { error: 'invalid_code' }],
    });
    const user = userEvent.setup();
    render(<SignInForm onDone={vi.fn()} />);
    expect(await screen.findByRole('img', { name: /QR code/ })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/svg/),
    );
    expect(screen.getByText('JBSWY3DP')).toBeInTheDocument();

    await user.type(screen.getByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code didn’t work.');
  });

  it('goes back to the password step for an account that is not the owner', async () => {
    mockApi({
      '/api/auth/status': [200, { step: 'verify' }],
      '/api/auth/mfa/verify': [403, { error: 'forbidden' }],
    });
    const user = userEvent.setup();
    render(<SignInForm onDone={vi.fn()} />);
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('can’t use the admin');
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('explains an idle sign-out, and finishes at once for a signed-in session', async () => {
    mockApi({ '/api/auth/status': [200, { step: 'password' }] });
    render(<SignInForm onDone={vi.fn()} reason="expired" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('12 hours without activity');

    mockApi({ '/api/auth/status': [200, { step: 'done' }] });
    const onDone = vi.fn();
    render(<SignInForm onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
