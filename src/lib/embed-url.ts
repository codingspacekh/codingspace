import { safeEmbed } from '@/server/render/policy';

export type EmbedRef = { provider: 'youtube' | 'desmos' | 'geogebra'; id: string };

/**
 * A pasted YouTube, Desmos or GeoGebra link → the provider and id the content format stores.
 * The id must pass the renderer's own check (safeEmbed), so what the editor accepts is
 * exactly what students will see.
 */
export function parseEmbedUrl(input: string): EmbedRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let ref: EmbedRef | null = null;

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      url.searchParams.get('v') ?? (['embed', 'shorts', 'live'].includes(parts[0] ?? '') ? parts[1] : undefined);
    if (id) ref = { provider: 'youtube', id };
  } else if (host === 'youtu.be' && parts[0]) {
    ref = { provider: 'youtube', id: parts[0] };
  } else if (host === 'desmos.com' && parts[0] === 'calculator' && parts[1]) {
    ref = { provider: 'desmos', id: parts[1] };
  } else if (host === 'geogebra.org') {
    const id =
      parts[0] === 'm'
        ? parts[1]
        : parts[0] === 'material'
          ? parts.at(-1)
          : parts[0] === 'calculator'
            ? parts[1]
            : undefined;
    if (id) ref = { provider: 'geogebra', id };
  }
  return ref && safeEmbed(ref.provider, ref.id) ? ref : null;
}
