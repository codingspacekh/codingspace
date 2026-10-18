import {
  averageSeconds,
  change,
  countryName,
  deviceOf,
  formatDuration,
  isBot,
  pageLabel,
  sourceOf,
  subjectName,
  sumDays,
  trackedPath,
} from '@/lib/analytics';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; SM-A156E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

describe('which pages are counted', () => {
  it.each([
    ['/', '/'],
    ['/study/math', '/study/math'],
    ['/posts/am-gm-inequality?x=1#proof', '/posts/am-gm-inequality'],
    ['/series/paper-1', '/series/paper-1'],
    ['/series', '/series'],
    ['/search?q=cauchy', '/search'],
    ['/projects/', '/projects'],
    ['/author', '/author'],
    ['/saved', '/saved'],
  ])('%s → %s', (asPath, path) => expect(trackedPath(asPath)).toBe(path));

  it.each(['/admin', '/admin/posts', '/api/visit', '/posts/', '/posts/Bad_Slug', '/rss.xml', '/study/math/x', '/404'])(
    '%s is not counted',
    (asPath) => expect(trackedPath(asPath)).toBeNull(),
  );
});

describe('visitors and their devices', () => {
  it('leaves out robots, previews and tools', () => {
    for (const ua of [
      '',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 11; moto g power) Chrome-Lighthouse',
      'facebookexternalhit/1.1',
      'curl/8.7.1',
      'python-requests/2.32',
    ])
      expect(isBot(ua)).toBe(true);
    expect(isBot(IPHONE)).toBe(false);
    expect(isBot(MAC)).toBe(false);
  });

  it('tells phones, tablets and computers apart', () => {
    expect(deviceOf(IPHONE)).toBe('mobile');
    expect(deviceOf(ANDROID_PHONE)).toBe('mobile');
    expect(deviceOf(ANDROID_TABLET)).toBe('tablet');
    expect(deviceOf(IPAD)).toBe('tablet');
    expect(deviceOf(MAC)).toBe('desktop');
  });
});

describe('where visitors come from', () => {
  const own = 'codingspacekh.dev';
  it.each([
    ['https://www.google.com/', 'Google'],
    ['https://www.google.com.kh/search?q=secret', 'Google'],
    ['https://m.facebook.com/story.php?id=1', 'Facebook'],
    ['https://l.facebook.com/l.php?u=x', 'Facebook'],
    ['android-app://com.facebook.katana/', 'Facebook'],
    ['android-app://org.telegram.messenger/', 'Telegram'],
    ['https://t.me/somechannel', 'Telegram'],
    ['android-app://com.google.android.youtube/', 'YouTube'],
    ['android-app://com.google.android.gm/', 'Google'],
    ['https://youtu.be/abc', 'YouTube'],
    ['https://www.bing.com/', 'Bing'],
    ['https://chatgpt.com/', 'ChatGPT'],
    ['https://www.example.edu.kh/class/notes?id=4', 'example.edu.kh'],
  ])('%s → %s', (referrer, source) => expect(sourceOf(referrer, own)).toBe(source));

  it('a direct visit, a link inside the site or an odd address has no source', () => {
    expect(sourceOf(undefined, own)).toBeNull();
    expect(sourceOf('', own)).toBeNull();
    expect(sourceOf('https://codingspacekh.dev/study/math', own)).toBeNull();
    expect(sourceOf('https://www.codingspacekh.dev/', 'codingspacekh.dev:443')).toBeNull();
    expect(sourceOf('not a url', own)).toBeNull();
    expect(sourceOf('javascript:alert(1)', own)).toBeNull();
    expect(sourceOf(`https://${'a'.repeat(120)}.com/`, own)).toBeNull();
  });
});

describe('dashboard numbers', () => {
  const day = (views: number, visitors: number, seconds: number, timed: number) => ({
    day: '2026-10-18',
    views,
    visitors,
    seconds,
    timed,
  });

  it('adds up days and averages only the timed views', () => {
    const t = sumDays([day(3, 2, 100, 2), day(1, 1, 0, 0)]);
    expect(t).toEqual({ views: 4, visitors: 3, seconds: 100, timed: 2 });
    expect(averageSeconds(t)).toBe(50);
    expect(averageSeconds({ seconds: 0, timed: 0 })).toBe(0);
  });

  it('formats durations and changes', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(185)).toBe('3 min 05 s');
    expect(change(12, 10)).toBe('+20 %');
    expect(change(5, 10)).toBe('−50 %');
    expect(change(10, 10)).toBe('±0 %');
    expect(change(10, 0)).toBeNull();
  });

  it('names pages, subjects and countries', () => {
    expect(pageLabel('/posts/am-gm', 'The AM-GM inequality')).toBe('The AM-GM inequality');
    expect(pageLabel('/', null)).toBe('Home');
    expect(pageLabel('/saved', null)).toBe('Saved lessons');
    expect(pageLabel('/series', null)).toBe('Series');
    expect(pageLabel('/study/physics', null)).toBe('Physics (subject page)');
    expect(pageLabel('/study/chemistry', null)).toBe('/study/chemistry');
    expect(pageLabel('/posts/gone', null)).toBe('/posts/gone');
    expect(subjectName('it')).toBe('IT');
    expect(subjectName('zz')).toBe('zz');
    expect(countryName('KH')).toBe('Cambodia');
    expect(countryName(null)).toBe('Unknown');
  });
});
