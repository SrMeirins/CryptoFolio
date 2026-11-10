import { describe, expect, it } from 'vitest'
import { dominiosAlineados, filtersFromUrl, pasoRedondo, mensualSeries, monthRange, resumenMensual, tramosScale } from './fiscalCharts'
import { TRAMOS_DEFAULT } from './tramosIrpf'

// Gráficos de Fiscal (#301). Datos sintéticos.
const mes = (m: number, g: number, p: number, ops: number, acumulado: number) =>
  ({ mes: m, label: '', netoMes: g + p, gananciasMes: g, perdidasMes: p, operacionesMes: ops, acumulado })

describe('mensualSeries', () => {
  it('12 meses con los futuros vacíos; ganancias y pérdidas por separado', () => {
    const s = mensualSeries([mes(1, 5, 0, 1, 5), mes(2, 1, -3, 2, 3)])
    expect(s).toHaveLength(12)
    expect(s[1]).toMatchObject({ label: 'feb', neto: -2, ganancias: 1, perdidas: -3, operaciones: 2, acumulado: 3, futuro: false })
    expect(s[2]).toMatchObject({ neto: null, ganancias: null, acumulado: null, operaciones: 0, futuro: true })
  })
  it('con el año anterior, su acumulado en cada mes, también en los futuros', () => {
    const previo = Array.from({ length: 12 }, (_, i) => mes(i + 1, 10, 0, 1, (i + 1) * 10))
    const s = mensualSeries([mes(1, 5, 0, 1, 5)], previo)
    expect(s[0].acumuladoPrevio).toBe(10)
    expect(s[11]).toMatchObject({ futuro: true, acumuladoPrevio: 120 })
    expect(mensualSeries([mes(1, 5, 0, 1, 5)])[0].acumuladoPrevio).toBeNull()
  })
})

describe('resumenMensual', () => {
  it('mejor y peor mes entre los que tuvieron operaciones', () => {
    const r = resumenMensual(mensualSeries([mes(1, 5, 0, 1, 5), mes(2, 0, 0, 0, 5), mes(3, 0, -8, 2, -3)]))
    expect([r.mejor?.mes, r.peor?.mes]).toEqual([1, 3])
    expect(r).toMatchObject({ conOperaciones: 2, transcurridos: 3 })
  })
  it('sin operaciones: sin mejor ni peor', () => {
    expect(resumenMensual(mensualSeries([mes(1, 0, 0, 0, 0)]))).toMatchObject({ mejor: null, peor: null, conOperaciones: 0 })
  })
})

describe('monthRange', () => {
  it('primer y último día, también en febrero bisiesto', () => {
    expect(monthRange(2024, 2)).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' })
    expect(monthRange(2025, 12)).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' })
  })
})

describe('tramosScale', () => {
  it('base en el primer tramo: dos peldaños de igual ancho', () => {
    const s = tramosScale(3_000, TRAMOS_DEFAULT)
    expect(s.segments.map(x => x.tipo)).toEqual([19, 21])
    expect(s.segments.map(x => x.widthPct)).toEqual([50, 50])
    expect(s.segments[0]).toMatchObject({ base: 3_000, activo: true, fillPct: 50 })
    expect(s.segments[0].cuota).toBeCloseTo(570, 9)
    expect(s.markerPct).toBeCloseTo(25, 9)
    expect(s.siguiente).toEqual({ faltan: 3_000, tipo: 21 })
  })
  it('base en el segundo tramo: el primero lleno y el marcador dentro del segundo', () => {
    const s = tramosScale(28_000, TRAMOS_DEFAULT)
    expect(s.segments.map(x => x.tipo)).toEqual([19, 21, 23])
    expect(s.segments[0].fillPct).toBe(100)
    expect(s.segments[1].fillPct).toBeCloseTo(50, 9)
    expect(s.markerPct).toBeCloseTo(100 / 3 + 50 / 3, 9)
    expect(s.segments.reduce((a, x) => a + x.base, 0)).toBeCloseTo(28_000, 6)
  })
  it('base en el último tramo, sin techo: sin siguiente', () => {
    const s = tramosScale(400_000, TRAMOS_DEFAULT)
    expect(s.siguiente).toBeNull()
    expect(s.segments).toHaveLength(5)
    expect(s.segments.reduce((a, x) => a + x.base, 0)).toBeCloseTo(400_000, 6)
  })
  it('base nula', () => {
    expect(tramosScale(0, TRAMOS_DEFAULT)).toMatchObject({ markerPct: 0, siguiente: null })
  })
})

describe('filtersFromUrl', () => {
  it('acepta fechas y símbolos válidos e ignora el resto', () => {
    expect(filtersFromUrl(new URLSearchParams('desde=2025-03-01&hasta=2025-03-31&activo=XRP'))).toEqual({ from: '2025-03-01', to: '2025-03-31', asset: 'XRP' })
    expect(filtersFromUrl(new URLSearchParams('desde=ayer&activo=<script>'))).toEqual({})
  })

  it('resultado: ganancia o pérdida; cualquier otro valor se ignora (#418)', () => {
    expect(filtersFromUrl(new URLSearchParams('resultado=ganancia'))).toEqual({ result: 'gain' })
    expect(filtersFromUrl(new URLSearchParams('resultado=perdida'))).toEqual({ result: 'loss' })
    expect(filtersFromUrl(new URLSearchParams('resultado=todo'))).toEqual({})
  })
})

describe('pasoRedondo', () => {
  it('1, 2, 2,5 o 5 por potencia de 10', () => {
    expect([0.3, 1, 1.2, 2.2, 3.4, 7, 36].map(pasoRedondo)).toEqual([0.5, 1, 2, 2.5, 5, 10, 50])
  })
})

describe('dominiosAlineados', () => {
  it('el cero y las marcas caen en las mismas líneas en los dos ejes y cada uno cubre sus datos', () => {
    const d = dominiosAlineados([5, -15], [0, -100])
    expect(d.a.ticks.indexOf(0)).toBe(d.b.ticks.indexOf(0))
    expect(d.a.ticks).toHaveLength(5)
    expect(d.a.domain[0]).toBeLessThanOrEqual(-15)
    expect(d.a.domain[1]).toBeGreaterThanOrEqual(5)
    expect(d.b.domain[0]).toBeLessThanOrEqual(-100)
    expect(d.a.ticks).toEqual([-15, -10, -5, 0, 5])
  })
  it('todo positivo: el cero abajo en ambos, con pasos redondos', () => {
    const d = dominiosAlineados([10, 20], [30, 50])
    expect(d.a.ticks).toEqual([0, 5, 10, 15, 20])
    expect(d.b.ticks).toEqual([0, 20, 40, 60, 80])
  })
  it('todo negativo: el cero arriba', () => {
    expect(dominiosAlineados([-3], [-80]).b.ticks).toEqual([-80, -60, -40, -20, 0])
  })
  it('sin datos: un eje neutro desde cero', () => {
    expect(dominiosAlineados([0], [0]).a.domain).toEqual([0, 4])
  })
})
