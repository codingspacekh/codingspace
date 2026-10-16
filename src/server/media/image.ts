import sharp, { type Metadata, type Sharp } from 'sharp';
import { MAX_IMAGE_PIXELS } from '@/lib/media-rules';
import { IMAGE_FORMATS, type ImageFormat } from '@/lib/media-urls';

/**
 * Upload → web images (03 §7, NFR-PRIV-1): re-encoded once, at upload, to AVIF and WebP at
 * 480/960/1600 px wide. Re-encoding drops everything but pixels: EXIF (GPS, camera, owner),
 * XMP, IPTC and comments, and anything hidden after the image data.
 */

export const VARIANT_WIDTHS = [480, 960, 1600] as const;

/** Standard widths narrower than the image, plus the image's own width if it is under 1600. */
export function variantWidths(width: number): number[] {
  const smaller = VARIANT_WIDTHS.filter((w) => w < width);
  return width < VARIANT_WIDTHS.at(-1)! ? [...smaller, width] : [...VARIANT_WIDTHS];
}

export type Variant = { width: number; height: number; format: ImageFormat; data: Buffer };
export type ProcessedImage = { width: number; height: number; widths: number[]; variants: Variant[] };

export class ImageError extends Error {}

const QUALITY: Record<ImageFormat, (s: Sharp) => Sharp> = {
  avif: (s) => s.avif({ quality: 55, effort: 4 }),
  webp: (s) => s.webp({ quality: 80, effort: 4 }),
};

export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  // failOn 'error': a truncated or corrupt file is refused rather than half-decoded.
  const open = () => sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error', animated: false });
  let meta: Metadata;
  try {
    meta = await open().metadata();
  } catch (e) {
    throw new ImageError('The image could not be read. Is the file damaged?', { cause: e });
  }
  if (!meta.width || !meta.height) throw new ImageError('The image could not be read. Is the file damaged?');
  if (meta.width * meta.height > MAX_IMAGE_PIXELS) {
    throw new ImageError(`The image is too large (at most ${MAX_IMAGE_PIXELS / 1_000_000} megapixels).`);
  }
  // EXIF orientation 5–8 means the photo is stored sideways; autoOrient() turns it upright.
  const sideways = (meta.orientation ?? 1) >= 5;
  const width = sideways ? meta.height : meta.width;
  const height = sideways ? meta.width : meta.height;
  const widths = variantWidths(width);

  try {
    // One width at a time (both formats together): a 50 MP photo decodes to ~150 MB, and six
    // pipelines at once could exhaust a serverless function's memory.
    const variants: Variant[] = [];
    for (const w of widths) {
      const pair = await Promise.all(
        IMAGE_FORMATS.map(async (format): Promise<Variant> => {
          const resized = open().autoOrient().resize({ width: w, withoutEnlargement: true });
          const { data, info } = await QUALITY[format](resized).toBuffer({ resolveWithObject: true });
          return { width: info.width, height: info.height, format, data };
        }),
      );
      variants.push(...pair);
    }
    return { width, height, widths, variants };
  } catch (e) {
    throw new ImageError('The image could not be converted. Is the file damaged?', { cause: e });
  }
}
