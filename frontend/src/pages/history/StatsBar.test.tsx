import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HistoryStats } from '../../api/portfolio'
import { StatsBar } from './StatsBar'

// Tarjetas del Historial (#376, #403), con datos sintéticos.
const m = (EUR: number) => ({ EUR, USD: EUR * 1.1 })
const totals: HistoryStats['totals'] = {
  ops: 12, unique_assets: 3, manual: 1,
  fiat_buys: 2, invested: m(100), recovered: m(30),
  sells: 1, sold: m(50), sold_gp: m(-4),
  sold_by_counterpart: { fiat: { ops: 1, value: m(30) }, stablecoin: { ops: 0, value: m(0) }, cripto: { ops: 0, value: m(0) } },
  income_ops: 4, income: m(8), income_sin_valor: 1,
  fee_ops: 3, fees: m(2), fees_sin_valor: 0,
}
const sinMargen = { included: false, ops: 0, sells: 0 }
const render = (over: Partial<Parameters<typeof StatsBar>[0]> = {}) => renderToStaticMarkup(
  <StatsBar totals={totals} currency="EUR" filtered={false} margin={sinMargen} onIncludeMargin={() => {}} {...over} />)

describe('StatsBar (#376)', () => {
  it('cinco tarjetas, con la de ingresos y sus operaciones sin precio', () => {
    const html = render()
    for (const t of ['Invertido', 'Operaciones', 'Ingresos', 'Comisiones', 'Ventas']) expect(html).toContain(t)
    expect(html).toContain('4 ingresos · 1 sin precio')
    expect(html).toContain('100,00')
  })

  it('en USD usa los importes en dólares, sin pedir nada más', () => {
    const html = render({ currency: 'USD' })
    expect(html).toContain('110,00')
    expect(html).not.toContain('100,00')
  })

  it('con filtros, se rotula «según los filtros»', () => {
    expect(render({ filtered: true })).toContain('según los filtros')
    expect(render()).not.toContain('según los filtros')
  })
})

describe('StatsBar, cifras explicadas (#403)', () => {
  it('Invertido con su neto y Ventas con su G/P en color', () => {
    const html = render()
    expect(html).toContain('Neto 70,00')
    expect(html).toContain('tras recuperar 30,00')
    expect(html).toMatch(/text-negative-ink[^>]*>G\/P -4,00/)
  })

  it('sin fiat recuperado no hay línea de neto', () => {
    expect(render({ totals: { ...totals, recovered: m(0) } })).not.toContain('Neto ')
  })

  it('cada tarjeta tiene su ayuda accesible', () => {
    const html = render()
    for (const t of ['Invertido', 'Operaciones', 'Ingresos', 'Comisiones', 'Ventas']) expect(html).toContain(`aria-label="Qué suma ${t}"`)
  })

  it('interruptor de margen accesible y aviso de lo que queda fuera', () => {
    const fuera = render({ margin: { included: false, ops: 249, sells: 48 } })
    expect(fuera).toContain('role="switch"')
    expect(fuera).not.toContain('checked=""')
    expect(fuera).toContain('Sin margen: 249 operaciones quedan fuera del resumen, 48 de ellas ventas.')
    const dentro = render({ margin: { included: true, ops: 249, sells: 48 } })
    expect(dentro).toContain('checked=""')
    expect(dentro).toContain('Incluye 249 operaciones de margen, 48 de ellas ventas.')
  })

  it('sin operaciones de margen no hay aviso', () => {
    expect(render()).not.toContain('Sin margen:')
  })
})
