import Head from 'next/head';
import Link from 'next/link';
import { Animator } from '@arwes/react';
import { Backdrop, Decipher, Frame, TopBar } from '@/lib/ui';
import { useSound } from '@/lib/prefs';

export default function Home() {
  const play = useSound();
  return (
    <>
      <Head>
        <title>CodingSpace · M0 spike</title>
      </Head>
      <Animator root combine manager="stagger">
        <Backdrop />
        <TopBar />
        <main className="wrap">
          <span className="eyebrow">Link established · student terminal</span>
          <h1 className="headline" aria-label="Prove it. Model it. Code it.">
            <Decipher className="w1">Prove it.</Decipher>
            <Decipher className="w2">Model it.</Decipher>
            <Decipher className="w3">Code it.</Decipher>
          </h1>
          {/* Body copy is never wrapped in an animator: it must be readable on first paint. */}
          <p className="intro" data-testid="intro">
            Competition maths, physics, programming and Cambridge IT. Lessons I teach in class, written up so you can
            review them anytime.
          </p>
          <Frame testId="hero-card">
            <span className="eyebrow">Arwes FrameCorners</span>
            <h2>Problem of the week</h2>
            <p>Let a, b, c be positive reals. Prove that a/(b+c) + b/(c+a) + c/(a+b) ≥ 3/2.</p>
            <Link className="cta" href="/lesson" onClick={() => play('click')} onMouseEnter={() => play('hover')}>
              Open sample lesson →
            </Link>
          </Frame>
        </main>
      </Animator>
    </>
  );
}
