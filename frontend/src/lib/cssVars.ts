import type { CSSProperties } from 'react';

/** Typed helper for inline CSS custom properties. */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}
