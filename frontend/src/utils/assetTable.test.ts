import { describe, expect, it } from 'vitest'
import { buildRows, sortRows, walletShortName } from './assetTable'
import type { FifoLot as ApiFifoLot, FiatBalance as ApiFiatBalance } from '../api/portfolio'

function lot(overrides: Partial<ApiFifoLot> = {}): ApiFifoLot {
  return {
    asset: 'BTC', wallet_id: 'w1', wallet_name: 'Binance Spot', wallet_color: '#fff', wallet_kind: 'exchange',
    quantity: '1', cost_basis_eur: '100', avg_price_eur: '100',
    ...overrides,
  }
}

function fiat(overrides: Partial<ApiFiatBalance> = {}): ApiFiatBalance {
  return {
    asset: 'EUR', wallet_id: 'w1', wallet_name: 'Binance Spot', wallet_color: '#fff', wallet_kind: 'exchange',
    balance: '50',
    ...overrides,
  }
}

describe('buildRows', () => {
  it('agrupa varios lotes del mismo activo en una sola fila crypto', () => {
    const rows = buildRows(
      [lot({ quantity: '1', cost_basis_eur: '100' }), lot({ quantity: '2', cost_basis_eur: '150' })],
      { BTC: 50 },
      []
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.kind).toBe('crypto')
    if (row.kind === 'crypto') {
      expect(row.totalQuantity).toBe(3)
      expect(row.totalCostBasis).toBe(250)
      expect(row.value).toBe(150) // 3 * 50
    }
  })

  it('acumula por wallet dentro del mismo activo en vez de duplicar entradas', () => {
    const rows = buildRows(
      [lot({ wallet_id: 'w1', quantity: '1' }), lot({ wallet_id: 'w1', quantity: '2' }), lot({ wallet_id: 'w2', quantity: '1' })],
      {},
      []
    )
    const row = rows[0]
    expect(row.kind).toBe('crypto')
    if (row.kind === 'crypto') {
      expect(row.wallets).toHaveLength(2)
      expect(row.wallets.find(w => w.wallet_id === 'w1')?.quantity).toBe(3)
    }
  })

  it('agrupa saldos fiat del mismo activo en distintas wallets en una fila', () => {
    const rows = buildRows([], {}, [fiat({ wallet_id: 'w1', balance: '50' }), fiat({ wallet_id: 'w2', balance: '30' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('fiat')
    expect(rows[0].value).toBe(80)
  })

  it('ordena las filas resultantes por valor descendente', () => {
    const rows = buildRows(
      [lot({ asset: 'BTC', quantity: '1' }), lot({ asset: 'ETH', quantity: '1' })],
      { BTC: 10, ETH: 100 },
      []
    )
    expect(rows.map(r => r.asset)).toEqual(['ETH', 'BTC'])
  })
})

describe('sortRows', () => {
  const rows = buildRows(
    [lot({ asset: 'BTC', quantity: '1', cost_basis_eur: '100' }), lot({ asset: 'ETH', quantity: '2', cost_basis_eur: '50' })],
    { BTC: 50, ETH: 200 },
    []
  )

  it('ordena por nombre de activo alfabéticamente', () => {
    const sorted = sortRows(rows, 'asset', 'asc', {}, 0)
    expect(sorted.map(r => r.asset)).toEqual(['BTC', 'ETH'])
  })

  it('invierte el orden al cambiar la dirección', () => {
    const asc  = sortRows(rows, 'value', 'asc',  { BTC: 50, ETH: 200 }, 0)
    const desc = sortRows(rows, 'value', 'desc', { BTC: 50, ETH: 200 }, 0)
    expect(asc.map(r => r.asset)).toEqual(desc.map(r => r.asset).reverse())
  })

  it('ordena por P&L calculado a partir del precio y el coste base', () => {
    // BTC: valor 50 (1*50), coste 100 -> P&L -50. ETH: valor 400 (2*200), coste 50 -> P&L +350.
    const sorted = sortRows(rows, 'pnl', 'desc', { BTC: 50, ETH: 200 }, 0)
    expect(sorted.map(r => r.asset)).toEqual(['ETH', 'BTC'])
  })
})

describe('walletShortName', () => {
  it('usa solo la sub-cuenta para wallets de tipo exchange', () => {
    expect(walletShortName('Binance Spot', 'exchange')).toBe('Spot')
    expect(walletShortName('Binance Funding', 'exchange')).toBe('Funding')
  })

  it('devuelve el nombre completo si el exchange no tiene sub-cuenta en el nombre', () => {
    expect(walletShortName('Binance', 'exchange')).toBe('Binance')
  })

  it('devuelve el nombre completo para wallets frías', () => {
    expect(walletShortName('Mi Ledger', 'cold')).toBe('Mi Ledger')
  })
})
