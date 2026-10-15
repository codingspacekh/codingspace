import type { AppProps } from 'next/app';
import { Titillium_Web, JetBrains_Mono } from 'next/font/google';
import { AnimatorGeneralProvider } from '@arwes/react';
import { PrefsProvider, usePrefs } from '@/lib/prefs';
import '@/styles/globals.css';

// next/font downloads the fonts at build time and serves them from our own origin (CSP font-src 'self').
const body = Titillium_Web({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

function Motion({ children }: { children: React.ReactNode }) {
  const { motion } = usePrefs();
  return (
    <AnimatorGeneralProvider disabled={!motion} duration={{ enter: 0.4, exit: 0.3, stagger: 0.08 }}>
      {children}
    </AnimatorGeneralProvider>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`app ${body.variable} ${mono.variable}`}>
      <PrefsProvider>
        <Motion>
          <Component {...pageProps} />
        </Motion>
      </PrefsProvider>
    </div>
  );
}
