import { describe, expect, it } from 'vitest'
import { summaryTiles } from './evolutionTiles'
import type { PeriodSummary } from './evolutionSummary'

// Mini-tarjetas del resumen de evolución (#250).
const D = 86_400_000
const clean = (s: string) => s.replace(/\s/g, ' ')
const x = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

const summary: PeriodSummary = {
  pct: 5, pnl: 100,
  best: { x: x('2026-04-20'), pct: 4.2, pnl: 120.5 },
  worst: { x: x('2026-05-03'), pct: null, pnl: -18.4 },
  drawdown: { pct: -12.345, fromX: x('2026-04-20'), toX: x('2026-04-20') + 10 * D },
}

describe('summaryTiles', () => {
  it('siempre tres tarjetas en el mismo orden', () => {
    expect(summaryTiles(summary, false, 'EUR').map(t => t.id)).toEqual(['best', 'worst', 'drawdown'])
    expect(summaryTiles(null, false, 'EUR').map(t => t.id)).toEqual(['best', 'worst', 'drawdown'])
  })

  it('mejor día: importe, % y fecha, y el día para abrir su detalle', () => {
    const [best] = summaryTiles(summary, false, 'EUR')
    expect(best).toMatchObject({ label: 'Mejor día', tone: 'positive', day: '2026-04-20' })
    expect(clean(best.value)).toBe('+120,50 €')
    expect(clean(best.badge!)).toMatch(/^\+4,20/)
    expect(best.detail).toBe('20 abr 26')
  })

  it('peor día sin % si el capital de partida era ínfimo', () => {
    const [, worst] = summaryTiles(summary, false, 'EUR')
    expect(worst).toMatchObject({ label: 'Peor día', tone: 'negative', badge: null, day: '2026-05-03' })
    expect(clean(worst.value)).toBe('-18,40 €')
  })

  it('máxima caída: %, duración y rango', () => {
    const [, , dd] = summaryTiles(summary, false, 'EUR')
    expect(clean(dd.value)).toMatch(/^-12,35/)
    expect(dd).toMatchObject({ badge: '10 días', detail: '20 abr 26 → 30 abr 26', day: null })
  })

  it('sin datos: «—» neutro con explicación', () => {
    const tiles = summaryTiles(null, false, 'EUR')
    expect(tiles.every(t => t.value === '—' && t.tone === 'neutral' && t.day === null)).toBe(true)
    expect(tiles[2].detail).toBe('Sin caídas en el periodo')
  })

  it('24H: por horas, sin detalle de día ni duración', () => {
    const [best, , dd] = summaryTiles(summary, true, 'EUR')
    expect(best.label).toBe('Mejor hora')
    expect(best.day).toBeNull()
    expect(best.detail).toMatch(/–/)
    expect(dd.badge).toBeNull()
  })
})
