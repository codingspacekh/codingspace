// @vitest-environment node
import sharp from 'sharp';
import { ImageError, processImage, variantWidths } from '@/server/media/image';

/** A JPEG photo with the EXIF a phone writes: GPS position, camera, owner, and a rotation. */
async function phonePhoto(width: number, height: number, orientation = 1) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'PhoneCo', Model: 'Phone 15', Artist: 'Student Name' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '11/1 33/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '104/1 55/1 0/1' },
    })
    .withMetadata({ orientation })
    .toBuffer();
}

describe('variant widths (480/960/1600)', () => {
  it.each([
    [3000, [480, 960, 1600]],
    [1600, [480, 960, 1600]],
    [1200, [480, 960, 1200]],
    [960, [480, 960]],
    [500, [480, 500]],
    [300, [300]],
  ])('an image %i px wide gets %j', (width, expected) => {
    expect(variantWidths(width)).toEqual(expected);
  });
});

describe('image pipeline', () => {
  it('the test photo really has EXIF and GPS to strip', async () => {
    const meta = await sharp(await phonePhoto(64, 48)).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif!.toString('latin1')).toContain('PhoneCo');
  });

  it('makes AVIF and WebP at each width, with no EXIF, GPS, XMP or ICC data', async () => {
    const out = await processImage(await phonePhoto(2000, 1000));
    expect(out).toMatchObject({ width: 2000, height: 1000, widths: [480, 960, 1600] });
    expect(out.variants.map((v) => `${v.width}x${v.height}.${v.format}`).sort()).toEqual([
      '1600x800.avif',
      '1600x800.webp',
      '480x240.avif',
      '480x240.webp',
      '960x480.avif',
      '960x480.webp',
    ]);
    for (const v of out.variants) {
      const meta = await sharp(v.data).metadata();
      expect(meta.format).toBe(v.format === 'avif' ? 'heif' : 'webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(v.data.toString('latin1')).not.toContain('PhoneCo');
      expect(v.data.toString('latin1')).not.toContain('Student Name');
    }
  });

  it('turns a sideways phone photo upright (EXIF orientation) before dropping the EXIF', async () => {
    // Stored 1000×600 with "rotate 90°": the photo is really 600 wide, 1000 tall.
    const out = await processImage(await phonePhoto(1000, 600, 6));
    expect(out).toMatchObject({ width: 600, height: 1000, widths: [480, 600] });
    const largest = out.variants.find((v) => v.width === 600 && v.format === 'webp')!;
    expect(largest.height).toBe(1000);
  });

  it('never enlarges a small image', async () => {
    const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#0000' } })
      .png()
      .toBuffer();
    const out = await processImage(png);
    expect(out.widths).toEqual([120]);
    expect(out.variants.every((v) => v.width === 120 && v.height === 80)).toBe(true);
  });

  it('refuses a damaged image', async () => {
    const jpeg = await phonePhoto(200, 200);
    await expect(processImage(jpeg.subarray(0, 300))).rejects.toThrow(ImageError);
  });

  it('refuses something that is not an image at all', async () => {
    await expect(processImage(Buffer.from('<svg onload="alert(1)"></svg>'))).rejects.toThrow(ImageError);
  });
});
