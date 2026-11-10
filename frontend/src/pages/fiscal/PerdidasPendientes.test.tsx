import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PerdidasPendientes } from './PerdidasPendientes'
import type { Carryforward, OrigenPerdida } from './types'

// Pérdidas pendientes (#541). Datos sintéticos.
const o = (p: Partial<OrigenPerdida> & { year: number; original: number }): OrigenPerdida => ({
  compensadoPatrim: 0, compensadoRend: 0, pendiente: p.original, caducado: 0, caducaEn: p.year + 4, provisional: false, aplicaciones: [], ...p,
})
const data: Carryforward = {
  pendienteTotal: 270, pendienteProvisional: 40,
  detalle: [{ year: 2026, netoAntes: -40, rendimientos: 0, perdida: 40, compensadoPatrim: 0, compensadoRend: 0, compensadoRendAnio: 0, compensado: 0, limiteRend25: 0, netoDespues: 0 }],
  origenes: [
    o({ year: 2022, original: 100, pendiente: 70, compensadoPatrim: 30, aplicaciones: [{ year: 2023, patrim: 30, rend: 0 }] }),
    o({ year: 2024, original: 200 }),
    o({ year: 2026, original: 40, provisional: true }),
  ],
}
const render = (d: Carryforward = data) => renderToStaticMarkup(<PerdidasPendientes data={d} onPlanificar={() => {}} hoy="2026-11-10" />)

describe('PerdidasPendientes (#541)', () => {
  it('tira: el pendiente no suma la provisional; lo que caduca este año va aparte', () => {
    const html = render()
    expect(html).toMatch(/Pendiente.*?270,00\s€/s)
    expect(html).toMatch(/Provisional.*?40,00\s€.*?año en curso, no suma/s)
    expect(html).toMatch(/Caduca este año.*?70,00\s€/s)
    expect(html).toContain('Ver Caduca este año en Planificar')
  })

  it('escala común: la barra de cada año mide su pérdida frente a la mayor', () => {
    const html = render()
    expect(html).toContain('style="width:50%"') // 2022: 100 de 200
    expect(html).toContain('style="width:100%"') // 2024
    expect(html).toContain('style="width:20%"') // 2026: 40 de 200
  })

  it('cuenta atrás de cada pérdida vigente, y «pronto» a 90 días o menos', () => {
    const html = render()
    expect(html).toMatch(/Caduca en <\/span>51 días/)
    expect(html).toMatch(/Caduca en <\/span>2 años y 1 mes/) // 2024 caduca el 31 dic 2028
    expect(html).toContain('31 dic 2028')
  })

  it('consejo de ir a Planificar si algo caduca este año; sin nada que caduque, no', () => {
    expect(render()).toMatch(/Consejo.*Planificar/s)
    const sinCaducar = { ...data, origenes: data.origenes!.filter(x => x.year !== 2022) }
    expect(render(sinCaducar)).not.toContain('En Planificar puedes ver')
  })

  it('«Ver detalle» solo en las pérdidas con compensaciones o caducadas, y «¿Cómo funciona?» en la cabecera', () => {
    const html = render()
    expect(html.match(/Ver el detalle de/g)).toHaveLength(1)
    expect(html).toContain('¿Cómo funciona?')
  })
})
