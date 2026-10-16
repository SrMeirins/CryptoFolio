import { describe, expect, it } from 'vitest'
import type { UnifiedRow } from './assetTable'
import { buildPositionsCsv, nextRowIndex, sparkSeries, tableTotals } from './portfolioTable'

// Tabla de posiciones (#282).
const crypto = (asset: string, qty: number, cost: number, price: number, wallets = ['Spot']): UnifiedRow => ({
  kind: 'crypto', asset, value: qty * price, totalQuantity: qty, totalCostBasis: cost, avgPrice: cost / qty,
  wallets: wallets.map(w => ({ wallet_id: w, wallet_name: w, wallet_color: '#000', wallet_kind: 'exchange', quantity: qty, costBasis: cost })),
})
const fiat: UnifiedRow = { kind: 'fiat', asset: 'EUR', quantity: 100, price: 1, value: 100, wallets: [{ wallet_id: 'Spot', wallet_name: 'Spot', wallet_color: '#000' }] }
const prices = { XRP: 2, ADA: 0.5 }

describe('tableTotals', () => {
  it('suma las filas visibles; P&L y coste solo de las posiciones con precio', () => {
    const rows = [crypto('XRP', 100, 150, 2), crypto('ADA', 100, 80, 0.5), crypto('NEW', 10, 10, 0), fiat]
    const t = tableTotals(rows, prices, 1_000)
    expect(t.value).toBe(350)                // 200 + 50 + 0 + 100
    expect(t.cost).toBe(230)
    expect(t.pnl).toBe(20)                   // 250 − 230
    expect(t.pnlPct).toBeCloseTo(8.696, 3)
    expect(t.weightPct).toBe(35)
  })
  it('sin filas, ceros y sin %', () => {
    expect(tableTotals([], prices, 0)).toEqual({ value: 0, cost: 0, pnl: 0, pnlPct: null, weightPct: 0 })
  })
})

describe('buildPositionsCsv', () => {
  it('cabecera con la moneda, números sin formato y fiat sin P&L', () => {
    const csv = buildPositionsCsv([crypto('XRP', 100, 150, 2, ['Spot', 'Ledger']), fiat], prices, 300, 'EUR').split('\n')
    expect(csv[0]).toBe('Activo;Wallets;Cantidad;Precio (EUR);Valor (EUR);Coste (EUR);P&L (EUR);P&L %;% cartera')
    expect(csv[1]).toBe('XRP;Spot | Ledger;100;2;200;150;50;33.33;66.67')
    expect(csv[2]).toBe('EUR;Spot;100;1;100;;;;33.33')
  })
  it('sanea los nombres para evitar fórmulas en la hoja de cálculo', () => {
    const csv = buildPositionsCsv([crypto('XRP', 1, 1, 2, ['=HYPERLINK("x")'])], prices, 2, 'EUR')
    expect(csv.split('\n')[1]).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('sparkSeries', () => {
  it('cierres + precio en vivo, convertidos a la moneda elegida', () => {
    expect(sparkSeries([{ price: 1 }, { price: 2 }], 3, 1.1)).toEqual([1.1, 2.2, 3.3000000000000003])
    expect(sparkSeries([{ price: 1 }], undefined, 1)).toEqual([1])
  })
})

describe('nextRowIndex', () => {
  it('↑ ↓ Inicio Fin con límites; otras teclas no navegan', () => {
    expect(nextRowIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextRowIndex('ArrowDown', 2, 3)).toBe(2)
    expect(nextRowIndex('ArrowUp', 0, 3)).toBe(0)
    expect(nextRowIndex('End', 0, 3)).toBe(2)
    expect(nextRowIndex('Home', 2, 3)).toBe(0)
    expect(nextRowIndex('a', 0, 3)).toBeNull()
    expect(nextRowIndex('ArrowDown', 0, 0)).toBeNull()
  })
})
