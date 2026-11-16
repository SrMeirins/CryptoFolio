import { describe, expect, it } from 'vitest'
import { agruparOtras, flexTarjeta } from './walletLayout'
import type { WalletSummary } from './portfolioInventory'

// Disposición de las tarjetas de wallet (#526). Datos sintéticos.
const w = (walletId: string, pct: number, value = pct * 10): WalletSummary => ({
  walletId, name: walletId, color: '#000000', kind: 'exchange', value, pct, assetCount: 1,
  composition: { top: [], others: { value: 0, pct: 0, count: 0 } }, pnl: null, pnlPct: null, avgOpenedAt: null,
})

describe('flexTarjeta', () => {
  it('crece en proporción a su peso desde el mínimo; sin peso, como la más pequeña', () => {
    expect(flexTarjeta(80)).toBe('80 1 15rem')
    expect(flexTarjeta(0.4)).toBe('1 1 15rem')
    expect(flexTarjeta(Number.NaN)).toBe('1 1 15rem')
  })
})

describe('agruparOtras', () => {
  const lista = [w('a', 80), w('b', 16), w('c', 1.5), w('d', 1.5), w('e', 1)]
  it('agrupa las de menos del umbral y su total suma lo de la cabecera', () => {
    const r = agruparOtras(lista, 2)
    expect(r.principales.map(x => x.walletId)).toEqual(['a', 'b'])
    expect(r.otras).toMatchObject({ pct: 4, value: 40 })
    const total = r.principales.reduce((s, x) => s + x.value, 0) + r.otras!.value
    expect(total).toBe(lista.reduce((s, x) => s + x.value, 0))
  })
  it('una sola pequeña no se agrupa; con umbral 0, ninguna; la filtrada nunca se esconde', () => {
    expect(agruparOtras([w('a', 99), w('b', 1)], 2).otras).toBeNull()
    expect(agruparOtras(lista, 0).otras).toBeNull()
    const r = agruparOtras(lista, 2, 'c')
    expect(r.principales.map(x => x.walletId)).toContain('c')
    expect(r.otras!.wallets.map(x => x.walletId)).toEqual(['d', 'e'])
  })
})
