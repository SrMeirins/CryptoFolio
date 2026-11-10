import { describe, expect, it } from 'vitest'
import { anchoEscalaComun, caducanEsteAnio, cuentaAtras, detalleCompensacion, origenesView, totalCaducado } from './perdidasPendientes'
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

describe('origenesView — año en curso (#534)', () => {
  it('la pérdida del año en curso se clasifica como provisional, no como vigente', () => {
    const v = origenesView([o(2023, 100, 0, 100), { ...o(2026, 40, 0, 40), provisional: true }], 2026)
    expect(v.map(x => `${x.year}:${x.estado}`)).toEqual(['2023:vigente', '2026:provisional'])
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

describe('anchoEscalaComun (#541)', () => {
  it('todas las barras en la misma escala: la mayor pérdida ocupa el 100 %', () => {
    const ancho = anchoEscalaComun(origenes)
    expect(ancho(100)).toBe(100)
    expect(ancho(20)).toBe(20)
    expect(ancho(5)).toBe(5)
    expect(anchoEscalaComun([])(10)).toBe(0)
  })
})

describe('cuentaAtras (#541)', () => {
  it('días si queda menos de un trimestre, y entonces es «pronto»', () => {
    expect(cuentaAtras(2026, '2026-11-10')).toEqual({ dias: 51, texto: 'Caduca en 51 días', corto: '51 días', pronto: true })
    expect(cuentaAtras(2026, '2026-12-30').texto).toBe('Caduca en 1 día')
    expect(cuentaAtras(2026, '2026-12-31')).toMatchObject({ dias: 0, texto: 'Caduca hoy', pronto: true })
  })
  it('meses si queda menos de un año; años y meses si más', () => {
    expect(cuentaAtras(2026, '2026-03-15')).toMatchObject({ texto: 'Caduca en 9 meses', pronto: false })
    expect(cuentaAtras(2027, '2026-11-10')).toMatchObject({ texto: 'Caduca en 1 año y 1 mes', corto: '1 año y 1 mes' })
    expect(cuentaAtras(2029, '2026-11-10').texto).toBe('Caduca en 3 años y 1 mes')
    expect(cuentaAtras(2028, '2026-12-15').texto).toBe('Caduca en 2 años')
  })
  it('pasada la fecha: caducada', () => {
    expect(cuentaAtras(2025, '2026-01-01')).toMatchObject({ texto: 'Caducada', pronto: false })
  })
})

describe('detalleCompensacion (#541)', () => {
  it('ejercicio a ejercicio, con lo que quedaba después', () => {
    const d = detalleCompensacion({ original: 100, aplicaciones: [{ year: 2024, patrim: 20, rend: 10 }, { year: 2023, patrim: 30, rend: 0 }] })
    expect(d).toEqual([
      { year: 2023, patrim: 30, rend: 0, queda: 70 },
      { year: 2024, patrim: 20, rend: 10, queda: 40 },
    ])
    expect(detalleCompensacion({ original: 10 })).toEqual([])
  })
})
