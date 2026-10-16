import type { KatexOptions } from 'katex';

/** One KaTeX setup for the renderer and the editor's live preview, so they always agree. */
export const MAX_LATEX = 5_000;
export const KATEX_OPTIONS: KatexOptions = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  output: 'htmlAndMathml',
  maxSize: 20,
  maxExpand: 500,
};
