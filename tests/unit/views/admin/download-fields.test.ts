import {
  downloadBody,
  downloadsProblem,
  guessDownload,
  keptDownloads,
  toAdminDownload,
} from '@/views/admin/download-fields';

describe('download fields (2026-10-20)', () => {
  it.each([
    ['EasyMedia-Setup-0.11.0.exe', { label: 'Windows', note: 'Installer', platform: 'windows' }],
    ['setup.msi', { label: 'Windows', note: 'Installer', platform: 'windows' }],
    ['EasyMedia-0.11.0-win.zip', { label: 'Windows portable', note: 'No install: unzip and run', platform: 'windows' }],
    ['EasyMedia-0.11.0-mac-arm64.dmg', { label: 'Mac with Apple chip', note: '', platform: 'mac-arm' }],
    ['EasyMedia-0.11.0-mac-x64.dmg', { label: 'Mac with Intel', note: '', platform: 'mac-intel' }],
    ['EasyMedia.pkg', { label: 'macOS', note: '', platform: 'mac' }],
    ['app-release.apk', { label: 'Android', note: '', platform: 'android' }],
    ['source.zip', { label: '', note: '', platform: '' }],
  ])('guesses the button for %s', (name, guess) => {
    expect(guessDownload(name)).toEqual(guess);
  });

  it('turns stored buttons into rows and back', () => {
    const file = toAdminDownload({
      label: 'Windows',
      media: 'm1',
      name: 'a.exe',
      bytes: 9,
      sha256: 's',
      platform: 'windows',
    });
    const link = toAdminDownload({ label: 'Linux', url: 'https://x.example/a', note: 'AppImage' });
    expect(file).toMatchObject({ note: '', url: '', file: { media: 'm1', bytes: 9 } });
    expect(downloadBody(file)).toEqual({ label: 'Windows', note: '', platform: 'windows', media: 'm1' });
    expect(downloadBody(link)).toEqual({ label: 'Linux', note: 'AppImage', platform: '', url: 'https://x.example/a' });
    expect(file.key).not.toBe(link.key);
  });

  it('drops empty rows and says what stops saving', () => {
    const row = (o: object) => ({ key: 'k', label: '', note: '', platform: '' as const, url: '', file: null, ...o });
    expect(keptDownloads([row({}), row({ label: 'Windows' })])).toHaveLength(1);
    expect(downloadsProblem([row({})])).toBeNull();
    expect(downloadsProblem([row({ label: 'Windows', uploading: true })])).toMatch(/Wait for the uploads/);
    expect(downloadsProblem([row({ url: 'https://x.example' })])).toMatch(/needs a label/);
    expect(downloadsProblem([row({ label: 'Windows', url: 'http://x.example' })])).toMatch(/^Download “Windows”: /);
    expect(
      downloadsProblem([row({ label: 'Windows', file: { media: 'm', name: 'a', bytes: 1, sha256: '' } })]),
    ).toBeNull();
  });
});
