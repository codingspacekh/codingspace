// Origins that published content may load from (03 §8.4). Shared by the renderer's URL
// policy and the CSP so the two cannot drift apart. Plain ESM so next.config.mjs can import it.

/** Images and file downloads (Cloudflare R2 behind our own domain). */
export const MEDIA_ORIGIN = 'https://files.codingspace.io';

/** Embed providers; the renderer builds iframe URLs on these origins only. */
export const EMBED_ORIGINS = Object.freeze({
  youtube: 'https://www.youtube-nocookie.com',
  desmos: 'https://www.desmos.com',
  geogebra: 'https://www.geogebra.org',
});
