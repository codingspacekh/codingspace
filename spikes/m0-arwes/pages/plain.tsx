// Control page for M0 measurements: same lesson HTML, no Arwes components on the page.
import Head from 'next/head';
export { getStaticProps } from './lesson';
export default function Plain({ html }: { html: string }) {
  return (
    <>
      <Head><title>Control · CodingSpace spike</title></Head>
      <main className="wrap lesson">
        <h1>AM–GM: the workhorse inequality</h1>
        <article className="lesson-body" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </>
  );
}
