import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HistoryStats } from '../../api/portfolio'
import { StatsBar } from './StatsBar'

// Tarjetas del Historial (#376), con datos sintéticos.
const totals: HistoryStats['totals'] = {
  ops: 12, unique_assets: 3, manual: 1,
  fiat_buys: 2, invested: { EUR: 100, USD: 110 },
  sells: 1, sold: { EUR: 50, USD: 55 },
  income_ops: 4, income: { EUR: 8, USD: 8.8 }, income_sin_valor: 1,
  fee_ops: 3, fees: { EUR: 2, USD: 2.2 }, fees_sin_valor: 0,
}

describe('StatsBar (#376)', () => {
  it('cinco tarjetas, con la de ingresos y sus operaciones sin precio', () => {
    const html = renderToStaticMarkup(<StatsBar totals={totals} currency="EUR" filtered={false} />)
    for (const t of ['Invertido', 'Operaciones', 'Ingresos', 'Comisiones', 'Ventas']) expect(html).toContain(t)
    expect(html).toContain('4 ingresos · 1 sin precio')
    expect(html).toContain('100,00')
  })

  it('en USD usa los importes en dólares, sin pedir nada más', () => {
    const html = renderToStaticMarkup(<StatsBar totals={totals} currency="USD" filtered={false} />)
    expect(html).toContain('110,00')
    expect(html).not.toContain('100,00')
  })

  it('con filtros, se rotula «según los filtros»', () => {
    expect(renderToStaticMarkup(<StatsBar totals={totals} currency="EUR" filtered />)).toContain('según los filtros')
    expect(renderToStaticMarkup(<StatsBar totals={totals} currency="EUR" filtered={false} />)).not.toContain('según los filtros')
  })
})
