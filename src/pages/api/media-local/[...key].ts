import type { NextApiRequest, NextApiResponse } from 'next';
import { localMediaStore } from '@/server/media/store';

/**
 * Stands in for R2 when MEDIA_STORE=local (local runs and E2E tests; refused on Vercel):
 * PUT with a presigned query, like R2's; GET serves what was stored, with its headers.
 * Without MEDIA_STORE=local this route doesn't exist (404).
 */

export const config = { api: { bodyParser: false } };

async function readBody(req: NextApiRequest, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const store = localMediaStore();
  if (!store) return res.status(404).end();
  const key = ([] as string[]).concat(req.query.key ?? []).join('/');

  if (req.method === 'PUT') {
    const length = Number(req.headers['content-length']);
    const problem = store.verifyPut(key, req.query, String(req.headers['content-type'] ?? ''), length);
    if (problem) return res.status(403).json({ error: problem });
    const body = await readBody(req, length);
    if (!body || body.length !== length) return res.status(400).json({ error: 'body length differs' });
    await store.write(key, body, { contentType: String(req.headers['content-type']), cacheControl: 'no-store' });
    return res.status(200).end();
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const found = await store.read(key);
    if (!found) return res.status(404).end();
    res.setHeader('Content-Type', found.meta.contentType);
    res.setHeader('Cache-Control', found.meta.cacheControl);
    if (found.meta.contentDisposition) res.setHeader('Content-Disposition', found.meta.contentDisposition);
    res.setHeader('Content-Length', String(found.body.length));
    return res.status(200).end(req.method === 'HEAD' ? undefined : found.body);
  }

  res.setHeader('Allow', 'GET, HEAD, PUT');
  return res.status(405).end();
}
