import { describe, expect, it } from 'vitest'
import type { FiscalHito, Notification } from '../api/portfolio'
import { barrasSemana, cambioValor, diasSemana, opsPorDia, enlaceOperaciones, enlacePlazo, inicioSemana, mejorYPeor, plazosCercanos, resumenAvisos } from './resumenSemana'

// Construcción del resumen de 7 días (#522), con datos sintéticos.

describe('periodo', () => {
  it('hoy y los 6 anteriores, también al cambiar de mes', () => {
    expect(inicioSemana('2026-11-23')).toBe('2026-11-17')
    expect(diasSemana('2026-03-02')).toEqual(['2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    expect(enlaceOperaciones('2026-11-23')).toBe('/history?desde=2026-11-17&hasta=2026-11-23')
  })
})

describe('cambioValor', () => {
  const dia = (date: string, value: number, capitalIn = 0, capitalOut = 0) => ({ date, value, capitalIn, capitalOut })
  const dias = [dia('2026-11-15', 900), dia('2026-11-16', 1000), dia('2026-11-18', 1100, 200), dia('2026-11-23', 1300, 0, 50)]

  it('frente al cierre previo al periodo, con el valor en vivo y los flujos netos', () => {
    expect(cambioValor(dias, '2026-11-23', 1350)).toEqual({ cambio: 350, flujos: 150 })
  })

  it('sin valor en vivo, el último cierre; sin cierre previo, desde cero; sin nada, null', () => {
    expect(cambioValor(dias, '2026-11-23', null)?.cambio).toBe(300)
    expect(cambioValor(dias.slice(2), '2026-11-23', 1300)?.cambio).toBe(1300)
    expect(cambioValor([], '2026-11-23', null)).toBeNull()
  })
})

describe('mejorYPeor', () => {
  it('suma el aporte de cada día y elige el mayor positivo y el menor negativo', () => {
    const r = mejorYPeor([
      { contributions: [{ asset: 'AAA', pnl: 10 }, { asset: 'BBB', pnl: -4 }] },
      { contributions: [{ asset: 'AAA', pnl: -3 }, { asset: 'CCC', pnl: 5 }, { asset: 'BBB', pnl: -2.01 }] },
    ])
    expect(r?.mejor).toEqual({ asset: 'AAA', pnl: 7 })
    expect(r?.peor?.asset).toBe('BBB')
    expect(r?.peor?.pnl).toBeCloseTo(-6.01, 2)
  })

  it('sin negativos no hay peor; faltando un día, null', () => {
    expect(mejorYPeor([{ contributions: [{ asset: 'AAA', pnl: 1 }] }])?.peor).toBeNull()
    expect(mejorYPeor([{ contributions: [] }, undefined])).toBeNull()
  })
})

describe('resumenAvisos', () => {
  it('cuenta por gravedad y categorías sin repetir', () => {
    const a = (type: Notification['type'], category: string): Notification => ({ id: `${type}-${category}`, type, category, message: 'x' })
    expect(resumenAvisos([a('error', 'Precios'), a('warning', 'Precios'), a('info', 'Alertas')]))
      .toEqual({ total: 3, errores: 1, advertencias: 1, categorias: ['Precios', 'Alertas'] })
  })
})

describe('plazosCercanos', () => {
  const hito = (p: Partial<FiscalHito>): FiscalHito => ({
    id: 'renta', ejercicio: 2025, titulo: 'Renta 2025', desde: '2026-04-08', hasta: '2026-06-30', inicioAproximado: false,
    estado: 'proximo', diasRestantes: 100, diasParaAbrir: 10, progreso: 0, ...p,
  })

  it('abiertos y los que abren en 30 días, sin presentados, por fecha de fin', () => {
    const r = plazosCercanos([
      hito({ id: 'modelo721', titulo: 'Modelo 721', hasta: '2026-03-31', estado: 'en-curso', diasRestantes: 12 }),
      hito({ diasParaAbrir: 10 }),
      hito({ id: 'cierre', titulo: 'Cierre', hasta: '2026-12-31', diasParaAbrir: 45 }),
      hito({ id: 'modelo721', ejercicio: 2024, estado: 'en-curso', presentado: true }),
      hito({ id: 'renta', ejercicio: 2023, estado: 'pasado' }),
    ])
    expect(r.map(p => p.id)).toEqual(['modelo721', 'renta'])
    expect(r[0]).toMatchObject({ urgente: true, abierto: true, dias: 12, texto: 'Modelo 721: quedan 12 días', enlace: '/fiscal?anio=2025&vista=modelo721' })
    expect(r[1].texto).toMatch(/^Renta 2025: abre el /)
    expect(r[1]).toMatchObject({ urgente: false, abierto: false, dias: 10 })
  })

  it('el cierre del ejercicio solo en sus últimos 30 días', () => {
    const cierre = (diasRestantes: number) => hito({ id: 'cierre', titulo: 'Cierre del ejercicio 2026', estado: 'en-curso', diasRestantes })
    expect(plazosCercanos([cierre(38)])).toEqual([])
    expect(plazosCercanos([cierre(30)])[0].texto).toBe('Cierre del ejercicio 2026: quedan 30 días')
  })

  it('último día y apertura aproximada', () => {
    expect(plazosCercanos([hito({ estado: 'en-curso', diasRestantes: 0 })])[0].texto).toBe('Renta 2025: hoy es el último día')
    expect(plazosCercanos([hito({ inicioAproximado: true })])[0].texto).toMatch(/abre hacia/)
  })

  it('enlace de cada plazo', () => {
    expect(enlacePlazo({ id: 'renta', ejercicio: 2025 })).toBe('/fiscal?anio=2025')
    expect(enlacePlazo({ id: 'cierre', ejercicio: 2026 })).toBe('/fiscal?vista=planificar')
  })
})

describe('barrasSemana y opsPorDia', () => {
  it('siete días con su inicial, hoy marcado y los que faltan a cero', () => {
    const b = barrasSemana('2026-11-23', [{ date: '2026-11-23', pnl: 5, live: true }, { date: '2026-11-18', pnl: -2, live: false }])
    expect(b.map(x => x.letra).join('')).toBe('MXJVSDL')
    expect(b[6]).toMatchObject({ date: '2026-11-23', pnl: 5, live: true, hoy: true, nombre: 'lunes' })
    expect(b[1].pnl).toBe(-2)
    expect(b[0].pnl).toBe(0)
  })

  it('suma las categorías de cada día', () => {
    expect(opsPorDia('2026-11-23', [{ periodo: '2026-11-22', ops: { compra: 2, venta: 1 } }, { periodo: '2026-11-10', ops: { compra: 9 } }]))
      .toEqual([0, 0, 0, 0, 0, 3, 0])
  })
})
