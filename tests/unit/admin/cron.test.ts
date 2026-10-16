import { cronAuthorized } from '@/server/admin/cron';

const SECRET = 'x'.repeat(40);

describe('cronAuthorized', () => {
  it('accepts exactly "Bearer <secret>"', () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it('refuses anything else', () => {
    for (const header of [
      undefined,
      '',
      SECRET,
      `Bearer ${SECRET}x`,
      `bearer ${SECRET}`,
      `Bearer ${'y'.repeat(40)}`,
      [`Bearer ${SECRET}`],
    ]) {
      expect(cronAuthorized(header as string | undefined, SECRET)).toBe(false);
    }
  });
  it('is closed when no secret, or a short one, is configured', () => {
    expect(cronAuthorized('Bearer ', '')).toBe(false);
    expect(cronAuthorized('Bearer short', 'short')).toBe(false);
    expect(cronAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
});
