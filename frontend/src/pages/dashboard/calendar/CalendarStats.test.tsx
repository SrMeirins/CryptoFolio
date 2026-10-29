import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarStats } from './CalendarStats'
import type { MonthStats } from '../../../utils/calendarStats'

// Mini tarjetas del P&L diario con la variante compacta de StatCard (#412). Datos sintéticos.
const day = (date: string, pnl: number) => ({ date, pnl, pct: null, complete: true, live: false })
const stats: MonthStats = {
  positive: 3, negative: 1, best: day('2026-04-12', 40), worst: day('2026-04-05', -15), average: 10,
  streak: { sign: 'up', days: 2 },
}
const render = (selected: string | null = null, onOpenDay: ((d: string) => void) | undefined = () => {}) =>
  renderToStaticMarkup(<CalendarStats stats={stats} total={{ pnl: 80, pct: 2 }} currency="EUR" selected={selected} onOpenDay={onOpenDay} />)

describe('CalendarStats (#412)', () => {
  it('seis tarjetas compactas; Días con su anillo en lugar del icono', () => {
    const html = render()
    expect(html.match(/stat-card stat-card-in/g)).toHaveLength(6)
    expect(html).toContain('px-3 py-2.5')
    expect(html).toContain('3/4')
    expect(html).toContain('stroke-positive')
  })

  it('solo Mejor y Peor día son botones, y despliegan su detalle', () => {
    const html = render('2026-04-12')
    expect(html.match(/class="absolute inset-px/g)).toHaveLength(2)
    expect(html).toMatch(/aria-expanded="true" aria-label="Mejor día: \+40,00\s€\. día 12\. Ocultar el detalle del día"/)
    expect(html).toMatch(/aria-expanded="false" aria-label="Peor día: -15,00\s€\. día 5\. Ver el detalle del día"/)
  })

  it('sin manejador, todas estáticas', () => {
    const html = renderToStaticMarkup(<CalendarStats stats={stats} total={null} currency="EUR" />)
    expect(html).not.toContain('absolute inset-px')
  })
})
