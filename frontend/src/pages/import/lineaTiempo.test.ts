import { describe, expect, it } from 'vitest'
import { lineaCombinada } from './lineaTiempo'
import type { CoberturaExchange } from './types'

// Línea de tiempo por carriles (#332). Datos sintéticos.
const cob = (exchange: 'binance' | 'bitvavo', tramos: [string, string, boolean?][], hoy: string, meses: { mes: string; n: number }[] = []): CoberturaExchange => ({
  exchange, desde: tramos[0][0], hasta: tramos.at(-1)![1],
  tramos: tramos.map(([desde, hasta, nuevo]) => ({ desde, hasta, transacciones: 1, importaciones: [{ importId: null, archivo: `${exchange}.csv`, nuevo: !!nuevo, desde, hasta }] })),
  huecos: [], pendiente: tramos.at(-1)![1] < hoy ? { desde: tramos.at(-1)![1], hasta: hoy, dias: 1, revisionId: null } : null, meses,
})

describe('lineaCombinada', () => {
  it('escala común de la primera transacción de cualquier exchange a hoy, un carril por exchange en orden fijo', () => {
    const l = lineaCombinada([
      cob('bitvavo', [['2026-06-01', '2026-09-03']], '2026-10-20'),
      cob('binance', [['2022-01-01', '2026-06-16']], '2026-10-20'),
    ])!
    expect([l.inicio, l.fin]).toEqual(['2022-01-01', '2026-10-20'])
    expect(l.carriles.map(c => c.exchange)).toEqual(['binance', 'bitvavo'])
    expect(l.carriles[1].tramos).toEqual([{ desde: '2026-06-01', hasta: '2026-09-03', transacciones: 1 }])
    expect(l.carriles[1].pendiente?.hasta).toBe('2026-10-20')
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
