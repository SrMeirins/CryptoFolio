import { describe, expect, it } from 'vitest'
import type { EvolutionPoint } from './evolutionSeries'
import { metricasVentana, rebasarVentana, tramosSinPosiciones } from './evolucionVentana'

// Ventana visible del gráfico de evolución (#509). Datos sintéticos.
const D = 86_400_000
const p = (dia: number, value: number, pnl: number, deposit = 0, withdrawal = 0): EvolutionPoint =>
  ({ x: dia * D, value, pnl, pct: 0, stepPct: null, deposit, withdrawal, live: false })

// Historia: depósito de 1000 el día 1, sube a 1100, baja a 1050, retirada de 200 y sube a 900.
const serie = [p(1, 1000, 0, 1000), p(2, 1100, 100), p(3, 1050, 50), p(4, 850, 50, 0, 200), p(5, 900, 100)]

describe('rebasarVentana', () => {
  it('toda la historia: P&L acumulado y % sobre el máximo capital aportado, como el servidor', () => {
    const v = rebasarVentana(serie, 0, 10 * D)
    expect(v.map(x => x.pnl)).toEqual([0, 100, 50, 50, 100])
    // Capital: 1000 (máximo), luego 800 tras la retirada: el máximo sigue en 1000.
    expect(v.map(x => x.pct)).toEqual([0, 10, 5, 5, 10])
    expect(v.map(x => x.aportado)).toEqual([1000, 1000, 1000, 800, 800])
  })
  it('una ventana parte del valor del día anterior y su P&L empieza en el primer día visible', () => {
    const v = rebasarVentana(serie, 3 * D, 5 * D)
    expect(v.map(x => x.pnl)).toEqual([-50, -50, 0])
    // Base: valor del día 2 (1100); tras la retirada, 900: el máximo sigue en 1100.
    expect(v[0].pct).toBeCloseTo((-50 / 1100) * 100, 3)
    expect(v.map(x => x.aportado)).toEqual([1100, 900, 900])
  })
  it('fuera de la historia, vacía', () => {
    expect(rebasarVentana(serie, 20 * D, 30 * D)).toEqual([])
  })
})

describe('periodos sin posiciones', () => {
  const conHueco = [p(1, 0, 0), p(2, 0, 0), p(3, 500, 0, 500), p(4, 0.001, -500, 0, 0), p(5, 600, -400, 500)]
  it('se marcan y se agrupan en tramos seguidos', () => {
    const v = rebasarVentana(conHueco, 0, 10 * D)
    expect(v.map(x => x.vacio)).toEqual([true, true, false, true, false])
    expect(tramosSinPosiciones(v)).toEqual([{ from: D, to: 2 * D }, { from: 4 * D, to: 4 * D }])
  })
  it('no cuentan en máximo, mínimo ni variación; el aportado, sí', () => {
    const m = metricasVentana(rebasarVentana(conHueco, 0, 10 * D))!
    expect(m.minimo).toEqual({ valor: 500, x: 3 * D })
    expect(m.maximo).toEqual({ valor: 600, x: 5 * D })
    expect(m.variacionValor).toBe(100)
    expect(m.variacionPct).toBe(20)
    expect(m.aportadoNeto).toBe(1000)
    expect(metricasVentana(rebasarVentana([p(1, 0, 0)], 0, D))).toBeNull()
    // Partida ínfima frente al máximo: sin % de variación.
    expect(metricasVentana(rebasarVentana([p(1, 2, 0, 2), p(2, 1000, 0, 998)], 0, 3 * D))!.variacionPct).toBeNull()
  })
})
