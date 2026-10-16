import type { AppProps } from 'next/app';
import localFont from 'next/font/local';
import { UiRoot } from '@/ui';
import '@/styles/globals.css';

// Fonts are self-hosted from the Fontsource packages (SIL OFL 1.1), not fetched from Google at
// build time: Google sometimes returns file URLs next/font can't parse, which broke builds.
// next/font/local serves them from our origin (CSP font-src 'self') with size-adjusted fallbacks.
// Paths must be written out in full: next/font only accepts literals.
const body = localFont({
  src: [
    { path: '../../node_modules/@fontsource/titillium-web/files/titillium-web-latin-400-normal.woff2', weight: '400' },
    { path: '../../node_modules/@fontsource/titillium-web/files/titillium-web-latin-600-normal.woff2', weight: '600' },
    { path: '../../node_modules/@fontsource/titillium-web/files/titillium-web-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-body',
  display: 'swap',
});
// Only the body font is preloaded: every preload competes with the first paint on a phone
// (M2 Lighthouse gate). The others swap in when ready.
const mono = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2',
      weight: '500',
    },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});
// Display face for the logo and headline only.
const display = localFont({
  src: [{ path: '../../node_modules/@fontsource/orbitron/files/orbitron-latin-800-normal.woff2', weight: '800' }],
  variable: '--font-display',
  display: 'swap',
  preload: false,
});
// Khmer posts (lang="km", PUB-08).
const khmer = localFont({
  src: [
    { path: '../../node_modules/@fontsource/kantumruy-pro/files/kantumruy-pro-khmer-400-normal.woff2', weight: '400' },
    { path: '../../node_modules/@fontsource/kantumruy-pro/files/kantumruy-pro-khmer-600-normal.woff2', weight: '600' },
  ],
  variable: '--font-khmer',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`app ${body.variable} ${mono.variable} ${display.variable} ${khmer.variable}`}>
      <UiRoot>
        <Component {...pageProps} />
      </UiRoot>
    </div>
  );
}
