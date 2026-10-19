import { describe, expect, it } from 'vitest'
import { caducanEsteAnio, origenesView, totalCaducado } from './perdidasPendientes'
import type { OrigenPerdida } from '../pages/fiscal/types'

// Pérdidas pendientes por año de origen (#305). Datos sintéticos.
const o = (year: number, original: number, comp: number, pendiente: number, caducado = 0): OrigenPerdida =>
  ({ year, original, compensadoPatrim: comp, compensadoRend: 0, pendiente, caducado, caducaEn: year + 4 })

const origenes = [o(2023, 100, 0, 100), o(2022, 20, 10, 10), o(2019, 50, 20, 0, 30), o(2024, 5, 5, 0)]

describe('origenesView', () => {
  const v = origenesView(origenes, 2026)
  it('ordena por año y clasifica cada pérdida', () => {
    expect(v.map(x => `${x.year}:${x.estado}`)).toEqual(['2019:caducada', '2022:caduca-este-anio', '2023:vigente', '2024:agotada'])
  })
  it('los porcentajes de la barra suman 100', () => {
    for (const x of v) expect(x.pct.compensado + x.pct.pendiente + x.pct.caducado).toBeCloseTo(100, 9)
    expect(v[0].pct).toEqual({ compensado: 40, pendiente: 0, caducado: 60 })
  })
})

describe('caducanEsteAnio', () => {
  it('importe y años de las que caducan este año', () => {
    expect(caducanEsteAnio(origenes, 2026)).toEqual({ importe: 10, years: [2022] })
    expect(caducanEsteAnio(origenes, 2025)).toBeNull()
  })
  it('total caducado sin usar', () => {
    expect(totalCaducado(origenes)).toBe(30)
  })
})
