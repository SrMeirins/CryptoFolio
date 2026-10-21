import { describe, expect, it } from 'vitest'
import { lineaCombinada } from './lineaTiempo'
import type { CoberturaExchange } from './types'

// Línea de tiempo única (#328). Datos sintéticos.
const cob = (exchange: 'binance' | 'bitvavo', tramos: [string, string, boolean?][], hoy: string, meses: { mes: string; n: number }[] = []): CoberturaExchange => ({
  exchange, desde: tramos[0][0], hasta: tramos.at(-1)![1],
  tramos: tramos.map(([desde, hasta, nuevo]) => ({ desde, hasta, transacciones: 1, importaciones: [{ importId: null, archivo: `${exchange}.csv`, nuevo: !!nuevo, desde, hasta }] })),
  huecos: [], pendiente: tramos.at(-1)![1] < hoy ? { desde: tramos.at(-1)![1], hasta: hoy, dias: 1, revisionId: null } : null, meses,
})

describe('lineaCombinada', () => {
  it('divide en solo Binance, ambos, solo Bitvavo y pendiente', () => {
    const l = lineaCombinada([
      cob('binance', [['2022-01-01', '2026-06-16']], '2026-10-20'),
      cob('bitvavo', [['2026-06-01', '2026-09-03']], '2026-10-20'),
    ])!
    expect(l.inicio).toBe('2022-01-01')
    expect(l.fin).toBe('2026-10-20')
    expect(l.tramos.map(t => [t.zona, t.desde, t.hasta, t.pendiente])).toEqual([
      ['binance', '2022-01-01', '2026-05-31', false],
      ['ambos', '2026-06-01', '2026-06-16', false],
      ['bitvavo', '2026-06-17', '2026-09-03', false],
      ['ninguno', '2026-09-04', '2026-10-20', true],
    ])
  })

  it('un hueco entre tramos sin el otro exchange es «sin datos» no pendiente', () => {
    const l = lineaCombinada([cob('binance', [['2024-01-01', '2024-02-29'], ['2024-05-01', '2024-06-30']], '2024-06-30')])!
    expect(l.tramos.map(t => [t.zona, t.pendiente, t.dias])).toEqual([['binance', false, 60], ['ninguno', false, 61], ['binance', false, 61]])
  })

  it('archivos nuevos y actividad mensual sumada por exchange', () => {
    const l = lineaCombinada([
      cob('binance', [['2024-01-01', '2024-02-15', true]], '2024-02-15', [{ mes: '2024-01', n: 30 }, { mes: '2024-02', n: 10 }]),
      cob('bitvavo', [['2024-02-01', '2024-02-10']], '2024-02-15', [{ mes: '2024-02', n: 10 }]),
    ])!
    expect(l.nuevos).toEqual([{ desde: '2024-01-01', hasta: '2024-02-15', exchange: 'binance', archivo: 'binance.csv' }])
    expect(l.meses.map(m => [m.mes, m.total, m.nivel])).toEqual([['2024-01', 30, 4], ['2024-02', 20, 3]])
    expect(l.meses[1].porExchange).toEqual({ binance: 10, bitvavo: 10 })
  })

  it('sin cobertura no hay línea', () => {
    expect(lineaCombinada([])).toBeNull()
  })
})
