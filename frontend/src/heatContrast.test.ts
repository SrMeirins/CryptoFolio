import { describe, expect, it } from 'vitest'
import css from './index.css?raw'
import { contrastRatio, parseHex } from './utils/contrast'

// Mapa de calor (#233): el texto de las celdas (--cf-fg) se lee sobre toda la
// escala, del gris neutro (0 %) al tono intenso con la intensidad máxima del
// tema. La mezcla reproduce color-mix(in srgb, …), que interpola en sRGB.
function themeVars(theme: string): Record<string, string> {
  const block = css.match(new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  return Object.fromEntries([...block.matchAll(/--cf-([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
}
const mix = (a: string, b: string, t: number) => '#' + parseHex(a).map((x, i) =>
  Math.round(x * t + parseHex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('')

describe('contraste del mapa de calor', () => {
  for (const theme of ['dark', 'light']) {
    const v = themeVars(theme)
    it(`tema ${theme}: define los tonos y la intensidad máxima`, () => {
      expect(v['heat-up']).toMatch(/^#/)
      expect(v['heat-down']).toMatch(/^#/)
      expect(Number(v['heat-max'])).toBeGreaterThan(50)
    })
    for (const tone of ['heat-up', 'heat-down']) {
      it(`tema ${theme}: texto sobre ${tone} ≥ 4,5:1 en toda la escala`, () => {
        const max = Number(v['heat-max']) / 100
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const bg = mix(v[tone], v['bg-tertiary'], Math.min(t, 1) * max)
          expect(contrastRatio(v.fg, bg), `${theme} ${tone} ${Math.round(t * 100)} %`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})
