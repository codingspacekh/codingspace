import { Html, Head, Main, NextScript } from 'next/document';
import { BOOT_SCRIPT } from '@/config/boot-script.mjs';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="theme-color" content="#03080c" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/* Starts the first-load arrival before the first paint; allowed by its hash in the CSP. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
