import Head from 'next/head';
import { formatDate } from '@/lib/format';
import { useSubjects } from '@/lib/subjects';
import type { FeaturedProblem } from '@/server/data/types';

/** 03 PUB-05: the problem of the week on Home and on its subject page; hint and solution on request. */
export function ProblemOfTheWeek({ problem }: { problem: FeaturedProblem }) {
  const s = useSubjects().subject(problem.subject);
  return (
    <section className={`section c-${s?.color ?? 'cyan'}`} aria-labelledby="potw">
      {problem.hasMath && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      <div className="shead">
        <div>
          <span className="eyebrow">Week of {formatDate(problem.weekOf)}</span>
          <h2 id="potw">Problem of the week</h2>
        </div>
        <span className="tag">{[s?.name, problem.sectionTitle].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="potw">
        <div className="q prose" dangerouslySetInnerHTML={{ __html: problem.statementHtml }} />
        <div className="side">
          {/* <details> works without JavaScript and keeps the answer hidden until asked for. */}
          {problem.hintHtml && (
            <details className="reveal">
              <summary>Show a hint</summary>
              <div className="prose" dangerouslySetInnerHTML={{ __html: problem.hintHtml }} />
            </details>
          )}
          {problem.solutionHtml && (
            <details className="reveal">
              <summary>Show the solution</summary>
              <div className="prose" dangerouslySetInnerHTML={{ __html: problem.solutionHtml }} />
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
