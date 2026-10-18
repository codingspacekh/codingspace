import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { safeNext } from '@/lib/admin-api';
import { SignInForm } from '@/views/admin/sign-in-form';

export default function AdminLogin() {
  const router = useRouter();
  const done = useCallback(() => {
    router.replace(safeNext(router.query.next));
  }, [router]);
  const reason = typeof router.query.reason === 'string' ? router.query.reason : undefined;

  return (
    <div className="adm adm-center">
      <Head>
        <title>Sign in · CodingSpaceKH admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main id="main" className="frame adm-card">
        {router.isReady && <SignInForm onDone={done} reason={reason} />}
      </main>
    </div>
  );
}
