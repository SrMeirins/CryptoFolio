import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FiscalHero } from './FiscalHero'
import type { FiscalSummary } from './types'

// Tarjetas del ejercicio con StatCard (#418). Datos sintéticos.
const summary: FiscalSummary = {
  year: 2025, esAnioEnCurso: false, totalGanancias: 300, totalPerdidas: -120, netoPatrimonial: 180,
  numOperacionesPatrimoniales: 8, totalRendimientos: 15, numRendimientos: 4, valorTotal31Dic: 1000,
  superaUmbral721: false, umbral721: 50000, preciosPendientes: [], valorIncompleto: false,
}
const render = (onOpen?: (f: Record<string, string>) => void) =>
  renderToStaticMarkup(<FiscalHero summary={summary} cuota={34.2} tipoMedio={19} comparison={null} onOpen={onOpen} />)

describe('FiscalHero, tarjetas del ejercicio (#418)', () => {
  it('cuatro StatCard compactas con su color por significado', () => {
    const html = render(() => {})
    expect(html.match(/stat-card stat-card-in/g)).toHaveLength(4)
    expect(html).toContain('px-3 py-2.5')
    for (const c of ['--cf-positive', '--cf-negative', '--cf-warning', '--cf-fg-subtle']) expect(html).toContain(`--card:var(${c})`)
  })

  it('mismas cifras: ganancias, pérdidas, rendimientos y total de operaciones', () => {
    const html = render(() => {})
    expect(html).toMatch(/Ganancias: \+300,00\s€/)
    expect(html).toMatch(/Pérdidas: -120,00\s€/)
    expect(html).toMatch(/Rendimientos: 15,00\s€/)
    expect(html).toContain('Operaciones: 12')
  })

  it('con onOpen son botones con su destino; sin él, estáticas', () => {
    const html = render(() => {})
    expect(html).toContain('Ver las operaciones con ganancia')
    expect(html).toContain('Ver las operaciones con pérdida')
    expect(html).toContain('Ver la tabla de rendimientos')
    expect(html).toContain('Ver todas las operaciones del ejercicio')
    expect(render()).not.toContain('absolute inset-px')
  })
})
