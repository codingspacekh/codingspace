import Head from 'next/head';
import type { GetStaticProps } from 'next';
import katex from 'katex';
import { codeToHtml } from 'shiki';
import { Animator } from '@arwes/react';
import { Backdrop, Decipher, TopBar } from '@/lib/ui';
import 'katex/dist/katex.min.css';

type Props = { html: string };

const tex = (src: string, displayMode = false) => katex.renderToString(src, { displayMode, throwOnError: false, output: 'html' });

// Everything heavy (KaTeX, Shiki) runs at build time; the client receives plain HTML.
export const getStaticProps: GetStaticProps<Props> = async () => {
  const code = await codeToHtml(
    'def check(trials=100_000):\n    worst = float("inf")\n    for _ in range(trials):\n        a, b = random.random(), random.random()\n        c = 1 / (a * b)  # force abc = 1\n        worst = min(worst, (1+a)*(1+b)*(1+c))\n    return worst',
    { lang: 'python', theme: 'github-dark-default' },
  );
  const html = [
    `<p>If you learn only one inequality for competitions, learn this one. The arithmetic mean of non-negative numbers is never smaller than their geometric mean.</p>`,
    `<h2>1. Two numbers</h2>`,
    `<p>For any ${tex('a, b \\ge 0')}:</p>`,
    `<div class="math-block">${tex('\\frac{a+b}{2} \\;\\ge\\; \\sqrt{ab}', true)}</div>`,
    `<p><strong>Proof.</strong> Squares are never negative, so ${tex('(\\sqrt a - \\sqrt b)^2 \\ge 0')}. Expanding and rearranging gives the inequality.</p>`,
    `<h2>2. Test it numerically</h2>`,
    code,
  ].join('\n');
  return { props: { html } };
};

export default function Lesson({ html }: Props) {
  return (
    <>
      <Head>
        <title>AM–GM · CodingSpace spike</title>
      </Head>
      <Animator root combine manager="stagger">
        <Backdrop />
        <TopBar />
        <main className="wrap lesson">
          <span className="eyebrow">
            <Decipher>Study / Math / Inequalities</Decipher>
          </span>
          <h1>AM–GM: the workhorse inequality</h1>
          <article className="lesson-body" data-testid="lesson-body" dangerouslySetInnerHTML={{ __html: html }} />
        </main>
      </Animator>
    </>
  );
}
