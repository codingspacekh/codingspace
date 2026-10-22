/**
 * The icons a subject can show instead of its symbol (owner request 2026-10-23), drawn from the
 * owner's set (icons/svg/*-icon.svg) as plain outlines: one path each, stroked in the subject's
 * colour (currentColor), on a 48-unit grid with 2 units of room around it. The same paths draw
 * the orbit's hexagons on a canvas. Adding one: a new entry here, then pick it in the admin.
 */
export const SUBJECT_ICONS = {
  math: {
    name: 'Math',
    d: 'M24 6 L44 40 L4 40 Z M12.6 28.6 A11.4 11.4 0 1 0 35.4 28.6 A11.4 11.4 0 1 0 12.6 28.6Z',
  },
  physics: {
    name: 'Physics',
    d:
      'M4 40 L44 40 L44 18 Z M13.84 20.89 L22.6 16.08 A1 1 0 0 1 23.96 16.47 L28.78 25.23 A1 1 0 0 1 28.38 26.59 ' +
      'L19.62 31.41 A1 1 0 0 1 18.26 31.01 L13.44 22.25 A1 1 0 0 1 13.84 20.89Z M22 15 L34 8.4 M27.9 7.7 L34 8.4 L31.3 13.9',
  },
  coding: {
    name: 'Coding',
    d:
      'M8 8 L40 8 A4 4 0 0 1 44 12 L44 36 A4 4 0 0 1 40 40 L8 40 A4 4 0 0 1 4 36 L4 12 A4 4 0 0 1 8 8Z ' +
      'M4 16 L44 16 M11 24 L16 28 L11 32 M20 32 L28 32',
  },
  it: {
    name: 'IT',
    d:
      'M8 11 A16 5 0 1 0 40 11 A16 5 0 1 0 8 11Z M8 11 L8 37 M40 11 L40 37 M8 24 A16 5 0 0 0 40 24 ' +
      'M8 37 A16 5 0 0 0 40 37',
  },
  robotics: {
    name: 'Robotics',
    d:
      'M17 8 L31 8 A3 3 0 0 1 34 11 L34 37 A3 3 0 0 1 31 40 L17 40 A3 3 0 0 1 14 37 L14 11 A3 3 0 0 1 17 8Z ' +
      'M7.5 11 L10.5 11 A1.5 1.5 0 0 1 12 12.5 L12 20.5 A1.5 1.5 0 0 1 10.5 22 L7.5 22 A1.5 1.5 0 0 1 6 20.5 ' +
      'L6 12.5 A1.5 1.5 0 0 1 7.5 11Z M37.5 11 L40.5 11 A1.5 1.5 0 0 1 42 12.5 L42 20.5 A1.5 1.5 0 0 1 40.5 22 ' +
      'L37.5 22 A1.5 1.5 0 0 1 36 20.5 L36 12.5 A1.5 1.5 0 0 1 37.5 11Z M7.5 26 L10.5 26 A1.5 1.5 0 0 1 12 27.5 ' +
      'L12 35.5 A1.5 1.5 0 0 1 10.5 37 L7.5 37 A1.5 1.5 0 0 1 6 35.5 L6 27.5 A1.5 1.5 0 0 1 7.5 26Z ' +
      'M37.5 26 L40.5 26 A1.5 1.5 0 0 1 42 27.5 L42 35.5 A1.5 1.5 0 0 1 40.5 37 L37.5 37 A1.5 1.5 0 0 1 36 35.5 ' +
      'L36 27.5 A1.5 1.5 0 0 1 37.5 26Z M17.5 15 A2.5 2.5 0 1 0 22.5 15 A2.5 2.5 0 1 0 17.5 15Z ' +
      'M25.5 15 A2.5 2.5 0 1 0 30.5 15 A2.5 2.5 0 1 0 25.5 15Z',
  },
} as const;

export type SubjectIcon = keyof typeof SUBJECT_ICONS;
export const SUBJECT_ICON_NAMES = Object.keys(SUBJECT_ICONS) as SubjectIcon[];

/** The SVG's viewBox and stroke width for every icon. */
export const ICON_BOX = '-2 -2 52 52';
export const ICON_STROKE = 2.5;

/** The icon's path, or null when the subject shows its symbol (no icon, or one no longer in the list). */
export const iconPath = (icon: string | undefined): string | null =>
  icon && Object.hasOwn(SUBJECT_ICONS, icon) ? SUBJECT_ICONS[icon as SubjectIcon].d : null;
