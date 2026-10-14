// Contraste WCAG 2.x entre dos colores hexadecimales (#rgb o #rrggbb) (#198).

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Color no válido: ${hex}`)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Ratio de contraste (1–21) entre dos colores. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
