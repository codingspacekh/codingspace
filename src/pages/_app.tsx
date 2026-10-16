import type { AppProps } from 'next/app';
import { JetBrains_Mono, Kantumruy_Pro, Orbitron, Titillium_Web } from 'next/font/google';
import { UiRoot } from '@/ui';
import '@/styles/globals.css';

// next/font downloads fonts at build time and serves them from our own origin (CSP font-src 'self').
const body = Titillium_Web({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body' });
// Only the body font is preloaded: every preload competes with the first paint on a phone
// (M2 Lighthouse gate). The others swap in when ready (font-display: swap).
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', preload: false });
// Display face for the logo and headline only.
const display = Orbitron({ subsets: ['latin'], weight: ['800'], variable: '--font-display', preload: false });
// Khmer posts (lang="km", PUB-08). Not preloaded: most pages have no Khmer text.
const khmer = Kantumruy_Pro({ subsets: ['khmer'], weight: ['400', '600'], variable: '--font-khmer', preload: false });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`app ${body.variable} ${mono.variable} ${display.variable} ${khmer.variable}`}>
      <UiRoot>
        <Component {...pageProps} />
      </UiRoot>
    </div>
  );
}
