import {
  APP_ACCEPT,
  classifyUpload,
  cleanFileName,
  extensionOf,
  FILE_ACCEPT,
  formatBytes,
  IMAGE_ACCEPT,
} from '@/lib/media-rules';

describe('what may be uploaded (03 ADM-10, §8.4)', () => {
  it.each([
    ['image', 'photo.JPG', 'image/jpeg'],
    ['image', 'graph.png', 'image/png'],
    ['image', 'anim.gif', 'image/gif'],
    ['image', 'x.webp', 'image/webp'],
    ['image', 'x.avif', 'image/avif'],
    ['file', 'worksheet.pdf', 'application/pdf'],
    ['file', 'notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['file', 'data.csv', 'text/csv'],
    ['file', 'solution.py', 'text/plain'],
    ['file', 'page.html', 'text/plain'],
    ['file', 'lab.ipynb', 'application/json'],
  ] as const)('accepts a %s named %s as %s', (kind, name, mime) => {
    const out = classifyUpload(kind, name, 1000);
    expect(out).toMatchObject({ ok: true, type: { mime, kind } });
  });

  it('serves source code (even .html) as plain text, never as a page', () => {
    for (const name of ['a.html', 'a.js', 'a.css', 'a.py']) {
      expect(classifyUpload('file', name, 10)).toMatchObject({ ok: true, type: { mime: 'text/plain' } });
    }
  });

  it.each([
    ['image', 'logo.svg', /SVG/],
    ['file', 'logo.svg', /SVG/],
    ['image', 'IMG_0001.HEIC', /HEIC.*JPEG/],
    ['file', 'setup.exe', /Programs/],
    ['image', 'notes.pdf', /Images must be/],
    ['file', 'photo.jpg', /isn’t allowed/],
    ['file', 'noextension', /isn’t allowed/],
    ['file', 'archive.tar.gz', /isn’t allowed/],
  ] as const)('refuses a %s named %s', (kind, name, reason) => {
    const out = classifyUpload(kind, name, 1000);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toMatch(reason);
  });

  it('refuses empty and oversized files, saying the limit', () => {
    expect(classifyUpload('image', 'a.png', 0)).toEqual({ ok: false, error: 'The file is empty.' });
    expect(classifyUpload('image', 'a.png', 15 * 1024 * 1024)).toMatchObject({ ok: true });
    expect(classifyUpload('image', 'a.png', 15 * 1024 * 1024 + 1)).toEqual({
      ok: false,
      error: 'PNG image files can be at most 15.0 MB (this one is 15.0 MB).',
    });
    expect(classifyUpload('file', 'a.pdf', 51 * 1024 * 1024)).toMatchObject({ ok: false });
    expect(classifyUpload('file', 'a.txt', 6 * 1024 * 1024)).toMatchObject({ ok: false });
  });

  it.each([
    ['EasyMedia-Setup-0.11.0.exe', 'application/vnd.microsoft.portable-executable'],
    ['setup.msi', 'application/x-msi'],
    ['EasyMedia-0.11.0-mac-arm64.dmg', 'application/x-apple-diskimage'],
    ['installer.pkg', 'application/vnd.apple.installer+xml'],
    ['EasyMedia-0.11.0-win.zip', 'application/zip'],
    ['app-release.apk', 'application/vnd.android.package-archive'],
  ])('accepts the app download %s (2026-10-20)', (name, mime) => {
    expect(classifyUpload('app', name, 500 * 1024 * 1024)).toMatchObject({ ok: true, type: { mime, kind: 'app' } });
  });

  it('takes apps up to 2 GB, and only in a project’s Downloads', () => {
    expect(classifyUpload('app', 'a.exe', 2048 * 1024 * 1024)).toMatchObject({ ok: true });
    expect(classifyUpload('app', 'a.exe', 2048 * 1024 * 1024 + 1)).toMatchObject({ ok: false });
    expect(classifyUpload('app', 'notes.pdf', 10)).toEqual({
      ok: false,
      error: 'Downloads must be .exe, .msi, .dmg, .pkg, .zip or .apk files.',
    });
    for (const name of ['a.exe', 'a.msi', 'a.dmg', 'a.apk']) {
      expect(classifyUpload('file', name, 10)).toMatchObject({ ok: false, error: expect.stringMatching(/Downloads/) });
    }
    // A small ZIP is still a lesson file; in Downloads it is an app.
    expect(classifyUpload('file', 'a.zip', 10)).toMatchObject({ ok: true, type: { kind: 'file' } });
    expect(APP_ACCEPT).toBe('.exe,.msi,.dmg,.pkg,.zip,.apk');
  });

  it('lists the accepted extensions for the file pickers', () => {
    expect(IMAGE_ACCEPT).toBe('.jpg,.jpeg,.png,.gif,.webp,.avif');
    expect(FILE_ACCEPT).toContain('.pdf');
    expect(FILE_ACCEPT).not.toContain('.svg');
    expect(FILE_ACCEPT).not.toContain('.jpg');
  });

  it('reads the extension case-insensitively', () => {
    expect(extensionOf(' Photo.JPEG ')).toBe('jpeg');
    expect(extensionOf('README')).toBe('');
  });
});

describe('file names', () => {
  it('drops folders and control characters', () => {
    expect(cleanFileName('C:\\Users\\me\\Desktop\\work sheet.pdf')).toBe('work sheet.pdf');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('a\u0000b\nc.txt')).toBe('abc.txt');
  });

  it('drops right-to-left tricks that disguise the extension', () => {
    expect(cleanFileName('invoice\u202Efdp.exe')).toBe('invoicefdp.exe');
  });

  it('keeps Khmer names and the extension when shortening', () => {
    expect(cleanFileName('  លំហាត់  ទី១.pdf ')).toBe('លំហាត់ ទី១.pdf');
    const long = cleanFileName(`${'x'.repeat(300)}.pdf`);
    expect(long).toHaveLength(200);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(240 * 1024)).toBe('240 KB');
    expect(formatBytes(1_258_291)).toBe('1.2 MB');
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
  });
});
