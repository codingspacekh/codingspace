import { safeNext } from '@/lib/admin-api';

describe('safeNext', () => {
  it('keeps admin paths', () => {
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('/admin/posts/abc-123')).toBe('/admin/posts/abc-123');
  });
  it('never leaves the admin, or loops back to sign-in', () => {
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/',
      '/posts/x',
      '/administrator',
      '/admin/login',
      '/admin?x=1',
      '/admin/a b',
      undefined,
      ['/admin'],
    ]) {
      expect(safeNext(next)).toBe('/admin');
    }
  });
});
