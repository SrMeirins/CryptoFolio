import { describe, expect, it } from 'vitest'
import css from './index.css?raw'
import { contrastRatio, parseHex } from './utils/contrast'

// Contraste del texto de categoría (wallet, cuenta…) generado por ink() (#199).
// ink() acota la luminosidad OKLCH del color guardado entre --cf-ink-lmin y
// --cf-ink-lmax; este test reproduce ese cálculo para un barrido de colores
// (cualquier tono, claro u oscuro, apagado o saturado) y exige ≥ 4,5:1 sobre
// los fondos del tema y sobre el tinte de la propia insignia, en ambos temas.

type Rgb = [number, number, number]
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklch([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), Math.atan2(B, A)]
}

/** OKLCH → sRGB lineal sin ajustar a la gama (puede salirse de 0-1). */
function oklchToLinear([L, C, h]: Rgb): Rgb {
  const A = C * Math.cos(h), B = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (c: Rgb) => c.every(x => x >= -1e-4 && x <= 1 + 1e-4)
const clip = (c: Rgb) => c.map(x => Math.min(1, Math.max(0, x))) as Rgb
const toHex = (lin: Rgb) => '#' + clip(lin).map(x => Math.round(toGamma(x) * 255).toString(16).padStart(2, '0')).join('')

/** Dos formas de volver a la gama sRGB, porque los navegadores no coinciden: recorte y reducción de croma. */
function oklchToHex(lch: Rgb, mode: 'recorte' | 'croma'): string {
  if (mode === 'recorte' || inGamut(oklchToLinear(lch))) return toHex(oklchToLinear(lch))
  let lo = 0, hi = lch[1]
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinear([lch[0], mid, lch[2]]))) lo = mid; else hi = mid }
  return toHex(oklchToLinear([lch[0], lo, lch[2]]))
}

function themeBlock(selector: RegExp): string { return css.match(selector)?.[1] ?? '' }
function hexVar(block: string, name: string): string { return block.match(new RegExp(`--cf-${name}:\\s*(#[0-9a-fA-F]{3,6})`))?.[1] ?? '' }
function numVar(block: string, name: string): number { return Number(block.match(new RegExp(`--cf-${name}:\\s*([\\d.]+)`))?.[1]) }

/** Mezcla `percent`% de `fg` sobre `bg` (el tinte de la insignia: alpha(color, 9)). */
function mix(fg: string, bg: string, percent: number): string {
  const [a, b] = [parseHex(fg), parseHex(bg)]
  return '#' + a.map((x, i) => Math.round(x * percent / 100 + b[i] * (1 - percent / 100)).toString(16).padStart(2, '0')).join('')
}

// Barrido de colores de categoría: 12 tonos × 4 luminosidades × 3 cromas, más casos límite.
const SAMPLES: string[] = ['#000000', '#ffffff', '#808080', '#0a1f5c', '#f0e68c', '#ffff00', '#0000ff']
for (let h = 0; h < 360; h += 30) for (const L of [0.2, 0.45, 0.7, 0.95]) for (const C of [0.04, 0.12, 0.3]) {
  SAMPLES.push(oklchToHex([L, C, (h * Math.PI) / 180], 'croma'))
}

const THEMES = {
  oscuro: themeBlock(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/),
  claro: themeBlock(/:root\[data-theme='light'\]\s*\{([^}]*)\}/),
}
const BACKGROUNDS = ['bg-primary', 'bg-secondary', 'bg-card', 'bg-tertiary']

describe('ink(): texto de categoría legible en ambos temas (#199)', () => {
  for (const [theme, block] of Object.entries(THEMES)) {
    const lmin = numVar(block, 'ink-lmin'), lmax = numVar(block, 'ink-lmax')

    it(`tema ${theme}: define --cf-ink-lmin y --cf-ink-lmax`, () => {
      expect(lmin).toBeGreaterThanOrEqual(0)
      expect(lmax).toBeLessThanOrEqual(1)
      expect(lmin).toBeLessThan(lmax)
    })

    for (const mode of ['recorte', 'croma'] as const) {
      it(`tema ${theme} (${mode}): cualquier color ≥ 4,5:1 sobre fondos y sobre el tinte de su insignia`, () => {
        const fallos: string[] = []
        for (const color of SAMPLES) {
          const [L, C, h] = rgbToOklch(parseHex(color).map(x => x / 255) as Rgb)
          const text = oklchToHex([Math.min(lmax, Math.max(lmin, L)), C, h], mode)
          for (const bg of BACKGROUNDS) {
            const base = hexVar(block, bg)
            for (const fondo of [base, mix(color, base, 9)]) {
              const ratio = contrastRatio(text, fondo)
              if (ratio < 4.5) fallos.push(`${color}→${text} sobre ${fondo}: ${ratio.toFixed(2)}`)
            }
          }
        }
        expect(fallos.slice(0, 8)).toEqual([])
      })
    }
  }
})
