import { describe, expect, it } from 'vitest'
import { cantidadEnCampo, cascadaColchon, composicionColchon, parseImporteConSigno, parseCantidad, precioDe, saldos, textoPlan, ventasParaSimular } from './planVentas'
import type { PlanLot } from './planificador'

// Plan de ventas (#546). Datos sintéticos.
const venta = (p: Partial<{ asset: string; walletId: string; walletNombre: string; cantidad: number; precioEur: number | null }> = {}) =>
  ({ asset: 'AAA', walletId: 'w1', walletNombre: 'Uno', cantidad: 2, precioEur: null, ...p })

describe('planVentas', () => {
  it('precio propio si lo hay; si no, el en vivo; sin ninguno, el plan espera', () => {
    expect(precioDe(venta({ precioEur: 150 }), { AAA: 100 })).toBe(150)
    expect(precioDe(venta(), { AAA: 100 })).toBe(100)
    expect(precioDe(venta(), {})).toBeNull()
    expect(ventasParaSimular([venta(), venta({ asset: 'BBB' })], { AAA: 100 })).toBeNull()
    expect(ventasParaSimular([venta()], { AAA: 100 })).toEqual([{ asset: 'AAA', walletId: 'w1', cantidad: 2, precioEur: 100 }])
  })

  it('el colchón: orígenes menos lo ya usado', () => {
    expect(composicionColchon({ netoAnio: -800, pendienteVigente: 600, caducanEsteAnio: 150, colchon: 1_200 }))
      .toEqual({ perdidaAnio: 800, pendientes: 450, caducan: 150, usado: 200, colchon: 1_200 })
    // Año en ganancia: no hay pérdida del año y la ganancia ya usó parte de lo pendiente.
    expect(composicionColchon({ netoAnio: 300, pendienteVigente: 1_000, caducanEsteAnio: 0, colchon: 700 }))
      .toMatchObject({ perdidaAnio: 0, pendientes: 1_000, usado: 300 })
  })

  it('saldos por activo y wallet, de mayor a menor', () => {
    const l = (asset: string, walletId: string, quantity: number): PlanLot =>
      ({ asset, walletId, walletName: walletId, walletColor: '#fff', walletKind: 'exchange', openedAt: '2024-01-01', quantity, unitCost: 1 })
    expect(saldos([l('BBB', 'w1', 1), l('AAA', 'w1', 1), l('AAA', 'w2', 3), l('AAA', 'w1', 1)])).toEqual([
      { asset: 'AAA', total: 5, wallets: [{ id: 'w2', nombre: 'w2', cantidad: 3 }, { id: 'w1', nombre: 'w1', cantidad: 2 }] },
      { asset: 'BBB', total: 1, wallets: [{ id: 'w1', nombre: 'w1', cantidad: 1 }] },
    ])
  })

  it('texto legible del plan, con el efecto y la comisión', () => {
    const t = textoPlan({
      ejercicio: 2026, fecha: '13/11/2026', ventas: [venta({ precioEur: 150 })], prices: {}, comisionPct: 0.1,
      efecto: { ventas: [{ indice: 0, asset: 'AAA', walletId: 'w1', cantidad: 2, cantidadVendida: 2, precioEur: 150, bruto: 300, comision: 0.3, coste: 200, resultado: 99.7 }],
        ganancia: 99.7, perdida: 0, neto: 99.7, cuotaAntes: 100, cuotaDespues: 118.94, colchon: 0, avisos: [] },
    })
    const lineas = t.split('\n')
    expect(lineas[0]).toBe('Plan de fin de año 2026 (13/11/2026)')
    expect(lineas[1]).toMatch(/^- Vender 2 AAA de Uno a 150,00\s€ \(precio propio\): \+99,70\s€$/)
    expect(lineas.at(-1)).toBe('Comisión estimada 0,1 %. Calculado con FIFO global.')
  })
})

describe('parseCantidad', () => {
  it('punto o coma decimal, sin separador de miles', () => {
    expect(parseCantidad('0.123')).toBe(0.123)
    expect(parseCantidad('0,123')).toBe(0.123)
    expect(parseCantidad(' 12 ')).toBe(12)
    expect(parseCantidad('1.234,5')).toBeNaN()
    expect(parseCantidad('-1')).toBeNaN()
    expect(parseCantidad('')).toBeNaN()
  })
  it('lo que pone «Máx» se vuelve a leer igual', () => {
    expect(cantidadEnCampo(1234.56789)).toBe('1234,56789')
    expect(parseCantidad(cantidadEnCampo(0.000012345678))).toBe(0.00001235)
  })
})

describe('cascadaColchon', () => {
  it('los orígenes suben, lo usado baja y el colchón parte de cero', () => {
    const pasos = cascadaColchon({ perdidaAnio: 800, pendientes: 450, caducan: 150, usado: 200, colchon: 1_200 })
    expect(pasos.map(p => [p.clave, p.desde, p.hasta, p.tipo])).toEqual([
      ['perdidaAnio', 0, 800, 'suma'], ['pendientes', 800, 1_250, 'suma'], ['caducan', 1_250, 1_400, 'suma'],
      ['usado', 1_400, 1_200, 'resta'], ['colchon', 0, 1_200, 'total'],
    ])
  })
  it('sin orígenes, solo el colchón a cero', () => {
    expect(cascadaColchon({ perdidaAnio: 0, pendientes: 0, caducan: 0, usado: 0, colchon: 0 }).map(p => p.clave)).toEqual(['colchon'])
  })
})

describe('parseImporteConSigno', () => {
  it('un signo menos delante es una pérdida; el resto lo lee el parser de euros', () => {
    const parse = (s: string) => Number(s.replace('.', '').replace(',', '.'))
    expect(parseImporteConSigno('-2.000', parse)).toBe(-2000)
    expect(parseImporteConSigno('1.500,5', parse)).toBe(1500.5)
  })
})
