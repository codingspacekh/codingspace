import type { AppProps } from 'next/app';
import { Titillium_Web, JetBrains_Mono } from 'next/font/google';
import { UiRoot } from '@/ui';
import '@/styles/globals.css';

// next/font downloads fonts at build time and serves them from our own origin (CSP font-src 'self').
const body = Titillium_Web({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`app ${body.variable} ${mono.variable}`}>
      <UiRoot>
        <Component {...pageProps} />
      </UiRoot>
    </div>
  );
}
