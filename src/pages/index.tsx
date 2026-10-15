import { Layout } from '@/components/layout';
import { Decipher, Frame } from '@/ui';

// M1 placeholder home: proves the pipeline end to end. The full home page arrives in M2.
export default function Home() {
  return (
    <Layout title="CodingSpace">
      <span className="eyebrow">Link established · student terminal</span>
      <h1 className="headline" aria-label="Prove it. Model it. Code it.">
        <Decipher className="w1">Prove it.</Decipher>
        <Decipher className="w2">Model it.</Decipher>
        <Decipher className="w3">Code it.</Decipher>
      </h1>
      {/* Body copy is never wrapped in an animator: readable on first paint. */}
      <p className="intro" data-testid="intro">
        Competition maths, physics, programming and Cambridge IT. Lessons I teach in class, written up so you can review
        them anytime.
      </p>
      <Frame>
        <span className="eyebrow">Under construction</span>
        <h2>Lessons are on their way</h2>
        <p>The first lessons in Math, Physics, Coding and IT will appear here soon.</p>
      </Frame>
    </Layout>
  );
}
