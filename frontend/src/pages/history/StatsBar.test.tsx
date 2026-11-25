import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HistoryStats } from '../../api/portfolio'
import { StatsBar } from './StatsBar'

// Resumen del Historial (#376, #403, #407), con datos sintéticos.
const m = (EUR: number) => ({ EUR, USD: EUR * 1.1 })
const totals: HistoryStats['totals'] = {
  ops: 12, unique_assets: 3, manual: 1,
  fiat_buys: 2, invested: m(100), recovered: m(30),
  sells: 1, sold: m(50), sold_gp: m(-4),
  sold_by_counterpart: { fiat: { ops: 1, value: m(30) }, stablecoin: { ops: 0, value: m(0) }, cripto: { ops: 0, value: m(0) } },
  stable_to_fiat: { ops: 1, value: m(20) },
  withdrawn_ops: 1, withdrawn: m(40), deposited: m(150),
  income_ops: 4, income: m(8), income_sin_valor: 1,
  fee_ops: 3, fees: m(2), fees_sin_valor: 0, fees_included: { ops: 1, value: m(0.5) }, fees_in_price_ops: 0,
}
const zero = { invertido: m(0), retirado: m(0), ventas: m(0), ingresos: m(0), comisiones: m(0) }
const series: HistoryStats['series'] = [{ periodo: '2026-01', valor: zero }, { periodo: '2026-02', valor: { ...zero, invertido: m(100) } }]
const sinMargen = { included: false, ops: 0, sells: 0 }
const render = (over: Partial<Parameters<typeof StatsBar>[0]> = {}) => renderToStaticMarkup(
  <StatsBar totals={totals} series={series} currency="EUR" filtered={false} margin={sinMargen} onIncludeMargin={() => {}}
    card="" onSelectCard={() => {}} {...over} />)
const TITLES = ['Invertido', 'Retirado', 'Ventas', 'Ingresos', 'Comisiones']

describe('StatsBar (#376, #407)', () => {
  it('cinco tarjetas con su cifra; operaciones y activos en la cabecera', () => {
    const html = render()
    for (const t of TITLES) expect(html).toContain(t)
    // Cabecera de bloque (#553): los recuentos van como chips.
    expect(html).toContain('>12 operaciones<')
    expect(html).toContain('>3 activos<')
  })

  it('solo la cifra: recuentos, neto y G/P van en la ayuda, no bajo la cifra', () => {
    const html = render()
    expect(html).not.toContain('compras con fiat')
    expect(html).not.toContain('Neto 70')
    expect(html).not.toContain('G/P')
  })

  it('cada tarjeta es un botón que filtra la lista, con su ayuda fuera del botón', () => {
    const html = render()
    for (const t of TITLES) {
      expect(html).toContain(`aria-label="${t}: `)
      expect(html).toContain(`aria-label="Qué suma ${t}"`)
    }
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5)
    // La ayuda no está dentro del botón de la tarjeta (controles anidados).
    expect(html).not.toMatch(/<button[^>]*aria-pressed[^>]*>(?:(?!<\/button>).)*Qué suma/s)
  })

  it('la tarjeta activa se marca y su botón quita el filtro', () => {
    const html = render({ card: 'ventas' })
    expect(html).toMatch(/data-active="true"/)
    expect(html).toMatch(/aria-label="Ventas: 50,00\s€\. 1 venta\. Quitar el filtro de sus operaciones"/)
  })

  it('mini gráfica decorativa por tarjeta', () => {
    expect(render().match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('con filtros, se rotula «según los filtros»', () => {
    expect(render({ filtered: true })).toContain('según los filtros')
    expect(render()).not.toContain('según los filtros')
  })

  it('chip con las operaciones de cada tarjeta, las mismas que su filtro (#553)', () => {
    const html = render()
    for (const texto of ['2 compras', '1 retirada', '1 venta', '4 ingresos', '3 comisiones']) expect(html).toContain(texto)
    // Con los filtros cambian los totales y con ellos el chip.
    const filtrado = render({ filtered: true, totals: { ...totals, fiat_buys: 0, sells: 3 } })
    expect(filtrado).toContain('Ninguna')
    expect(filtrado).toContain('3 ventas')
  })

  it('la tarjeta activa dice que está filtrando y la vacía se atenúa (#553)', () => {
    const activa = render({ card: 'ventas' })
    expect(activa).toContain('Filtrando: 1 venta')
    const vacia = render({ totals: { ...totals, sells: 0, sold: m(0) } })
    expect(vacia).toContain('Ninguna')
    expect(vacia).toMatch(/border-dashed/)
  })

  it('el margen se cambia en Opciones de vista; aquí, su aviso con enlace (#553)', () => {
    const fuera = render({ margin: { included: false, ops: 249, sells: 48 } })
    expect(fuera).not.toContain('role="switch"')
    expect(fuera).toContain('Sin margen: 249 operaciones quedan fuera del resumen, 48 de ellas ventas.')
    expect(fuera).toContain('Incluirlas')
    expect(render({ margin: { included: true, ops: 249, sells: 48 } })).toContain('Excluirlas')
    expect(render()).not.toContain('Incluirlas')
  })
})
