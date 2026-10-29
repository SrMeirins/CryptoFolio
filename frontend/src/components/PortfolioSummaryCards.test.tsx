import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PortfolioSummaryCards } from './PortfolioSummaryCards'

// Tarjetas de resumen del Dashboard con StatCard (#412). Datos sintéticos.
const noop = () => {}
const render = (over: Partial<Parameters<typeof PortfolioSummaryCards>[0]> = {}) => renderToStaticMarkup(
  <PortfolioSummaryCards totalValue={1200} totalCost={1000} pnl={200} pnlPct={20} hasPrices loading={false}
    valueTooltip={<p>Valor</p>} costTooltip={<p>Coste</p>} pnlTooltip={<p>P&L</p>} pnlPctTooltip={<p>Rent</p>}
    assetCount={3} eurFlow={{ deposited: 900, withdrawn: 100, netFromBank: 800 }} eurFlowTooltip={<p>Flujo</p>}
    valueTrend={[1, 2, 3]} pnlTrend={[1, 2]} returnTrend={[3, 4]}
    targets={{ portfolio: noop, evolution: noop, withdrawn: noop }} {...over} />,
)

describe('PortfolioSummaryCards (#412)', () => {
  it('cinco tarjetas clicables con su destino en el nombre accesible', () => {
    const html = render()
    expect(html.match(/Ver el inventario en Portfolio/g)).toHaveLength(3)
    expect(html).toContain('Ir al gráfico de evolución')
    expect(html).toContain('Ver las retiradas en el Historial')
  })

  it('colores por significado: marca, neutro, morado y P&L y Rentabilidad según su signo', () => {
    const html = render()
    expect(html).toContain('--card:var(--cf-brand)')
    expect(html).toContain('--card:var(--cf-fg-subtle)')
    expect(html).toContain('--card:var(--cf-accent-purple)')
    expect(html.match(/--card:var\(--cf-positive\)/g)).toHaveLength(2)
    const negative = render({ pnl: -50, pnlPct: -5 })
    expect(negative.match(/--card:var\(--cf-negative\)/g)).toHaveLength(2)
    expect(negative).toContain('text-negative')
  })

  it('sin texto bajo las cifras: activos, capital y flujos pasan a la ayuda', () => {
    const html = render()
    expect(html).not.toContain('activos en cartera')
    expect(html).not.toContain('invertidos')
    expect(html).not.toContain('depositado')
  })

  it('mini gráficas en Valor, P&L y Rentabilidad; ni en Coste ni en EUR neto', () => {
    expect(render().match(/<svg viewBox="0 0 100 28"/g)).toHaveLength(3)
    expect(render({ hasPrices: false }).match(/<svg viewBox="0 0 100 28"/g)).toBeNull()
  })

  it('chip Hoy en P&L con el dato del día', () => {
    expect(render({ todayPnl: 12.3 })).toContain('Hoy')
    expect(render()).not.toContain('>Hoy<')
  })
})
