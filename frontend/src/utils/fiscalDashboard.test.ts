import { describe, expect, it } from 'vitest'
import type { Carryforward, FiscalEvent } from '../pages/fiscal/types'
import { ejercicioPorDefecto, enlacesFiscal, perdidasQueCaducan, recuentoResultado } from './fiscalDashboard'

describe('ejercicioPorDefecto (#515)', () => {
  const anios = [2024, 2025, 2026]
  it('de abril a junio, el ejercicio anterior (campaña de la Renta)', () => {
    expect(ejercicioPorDefecto('2026-04-01', anios)).toBe(2025)
    expect(ejercicioPorDefecto('2026-06-30', anios)).toBe(2025)
  })
  it('el resto del año, el en curso', () => {
    expect(ejercicioPorDefecto('2026-03-31', anios)).toBe(2026)
    expect(ejercicioPorDefecto('2026-07-01', anios)).toBe(2026)
    expect(ejercicioPorDefecto('2026-01-02', anios)).toBe(2026)
  })
  it('sin datos del preferido, el más reciente anterior; sin datos, null', () => {
    expect(ejercicioPorDefecto('2026-11-19', [2023, 2024])).toBe(2024)
    expect(ejercicioPorDefecto('2026-05-10', [2026])).toBe(2026)
    expect(ejercicioPorDefecto('2026-05-10', [])).toBeNull()
  })
})

describe('enlacesFiscal', () => {
  it('cada cifra a su vista de Fiscal con el ejercicio y el filtro', () => {
    const e = enlacesFiscal(2025, false)
    expect(e.ganancias).toBe('/fiscal?anio=2025&vista=operaciones&resultado=ganancia')
    expect(e.perdidas).toBe('/fiscal?anio=2025&vista=operaciones&resultado=perdida')
    expect(e.mes(2)).toBe('/fiscal?anio=2025&vista=operaciones&desde=2025-02-01&hasta=2025-02-28')
    expect(e.modelo721).toBe('/fiscal?anio=2025&vista=modelo721')
  })
  it('IRPF: Planificar en el ejercicio en curso; el Resumen en uno cerrado', () => {
    expect(enlacesFiscal(2026, true).irpf).toBe('/fiscal?vista=planificar')
    expect(enlacesFiscal(2025, false).irpf).toBe('/fiscal?anio=2025')
  })
  it('febrero bisiesto', () => expect(enlacesFiscal(2024, false).mes(2)).toMatch(/hasta=2024-02-29$/))
})

describe('recuentoResultado', () => {
  const ev = (g: number) => ({ gananciaPerdidaEur: g, tipo: 'SELL', fecha: '2025-01-01' }) as FiscalEvent
  it('cuenta con el mismo umbral que el filtro de Operaciones (sin los nulos)', () => {
    expect(recuentoResultado([ev(10), ev(0.001), ev(-3), ev(-0.004), ev(5)])).toEqual({ ganancias: 2, perdidas: 1 })
  })
})

describe('perdidasQueCaducan', () => {
  const cf = (origenes: NonNullable<Carryforward['origenes']>): Carryforward => ({ pendienteTotal: 0, detalle: [], origenes })
  const o = (year: number, pendiente: number, caducaEn: number, provisional = false) =>
    ({ year, original: pendiente, compensadoPatrim: 0, compensadoRend: 0, pendiente, caducado: 0, caducaEn, provisional })
  it('suma lo pendiente que caduca este año, sin la pérdida provisional', () => {
    expect(perdidasQueCaducan(cf([o(2022, 100, 2026), o(2023, 50, 2027), o(2022, 20.5, 2026), o(2026, 9, 2030, true)]), 2026)).toBe(120.5)
    expect(perdidasQueCaducan(undefined, 2026)).toBe(0)
  })
})
