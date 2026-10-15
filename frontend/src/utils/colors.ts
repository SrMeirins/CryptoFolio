// Colores en estilos en línea (#198). Los colores con significado vienen del
// tema (variables CSS), así que cambian con él; para aplicarles opacidad no
// sirve concatenar hexadecimal (`${color}18`), de ahí alpha(), que usa
// color-mix y funciona tanto con variables como con hexadecimales.

/** Colores semánticos del tema activo. */
export const T = {
  fg: 'var(--cf-fg)',
  muted: 'var(--cf-fg-subtle)',
  brand: 'var(--cf-brand)',
  positive: 'var(--cf-positive)',
  negative: 'var(--cf-negative)',
  warning: 'var(--cf-warning)',
  info: 'var(--cf-info)',
  purple: 'var(--cf-accent-purple)',
  track: 'var(--cf-border)',
} as const

/** `color` con la opacidad indicada (0-100). */
export function alpha(color: string, percent: number): string {
  const p = Math.min(100, Math.max(0, percent))
  return `color-mix(in srgb, ${color} ${p}%, transparent)`
}

/**
 * Color de categoría (wallet, cuenta…) usado como texto. Conserva tono y
 * croma, pero acota la luminosidad OKLCH al rango del tema (--cf-ink-lmin /
 * --cf-ink-lmax): en oscuro aclara los colores oscuros y en claro oscurece
 * los claros, de modo que cualquier color guardado alcanza WCAG AA
 * (comprobado en inkContrast.test.ts).
 */
export function ink(color: string): string {
  return `oklch(from ${color} clamp(var(--cf-ink-lmin), l, var(--cf-ink-lmax)) c h)`
}
