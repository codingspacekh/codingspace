/**
 * A URL slug: lowercase letters and digits in words joined by single hyphens ("am-gm-inequality").
 * One definition for every place that checks one (posts, series, projects, syllabuses, the
 * on-device stores, content import). No imports, so browser code can use it too.
 */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const isSlug = (value: unknown): value is string => typeof value === 'string' && SLUG.test(value);
