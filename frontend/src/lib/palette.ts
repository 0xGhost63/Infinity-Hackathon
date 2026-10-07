export const ACCENTS = ['sky', 'pink', 'green', 'orange', 'violet', 'yellow'] as const;
export type Accent = (typeof ACCENTS)[number];

/**
 * Stable sticky-note color for a person or manager id. Sequential ids such as PM01, PM02,
 * PM03 land on different colors, so each person keeps one color across every screen.
 */
export function accentFor(key: string | null | undefined): Accent {
  if (!key) return 'yellow';
  let sum = 0;
  for (let index = 0; index < key.length; index += 1) sum += key.charCodeAt(index);
  return ACCENTS[sum % ACCENTS.length];
}

export function accentClass(key: string | null | undefined): string {
  return `accent-${accentFor(key)}`;
}
