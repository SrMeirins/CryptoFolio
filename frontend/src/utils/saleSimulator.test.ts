import { describe, expect, it } from 'vitest'
import type { OpenLot } from '../api/portfolio'
import { DEFAULT_FEE_PCT, parseFeePct, readFeePct, saveFeePct, walletQuantities } from './saleSimulator'

// Simulador de venta (#279).
const lot = (wallet: string, qty: number): OpenLot => ({
  wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: 'exchange', opened_at: '2024-01-01T00:00:00Z',
  quantity_original: String(qty), quantity_remaining: String(qty), price_per_unit_eur: '1', cost_basis_eur: String(qty),
  usd_per_eur: null, source_type: 'BUY',
})

describe('walletQuantities', () => {
  it('suma los lotes por wallet y ordena de mayor a menor', () => {
    expect(walletQuantities([lot('a', 10), lot('b', 30), lot('a', 5)])).toEqual([
      { walletId: 'b', walletName: 'W b', quantity: 30 },
      { walletId: 'a', walletName: 'W a', quantity: 15 },
    ])
  })
})

describe('comisión', () => {
  it('acepta coma decimal y rechaza valores fuera de 0–10', () => {
    expect(parseFeePct('0,25')).toBe(0.25)
    expect(parseFeePct('0')).toBe(0)
    expect(parseFeePct('50')).toBe(DEFAULT_FEE_PCT)
    expect(parseFeePct('abc')).toBe(DEFAULT_FEE_PCT)
    expect(parseFeePct(null)).toBe(DEFAULT_FEE_PCT)
  })
  it('sin almacenamiento disponible, la por defecto y guardar no falla', () => {
    expect(readFeePct()).toBe(DEFAULT_FEE_PCT)
    expect(() => saveFeePct(0.2)).not.toThrow()
  })
})
