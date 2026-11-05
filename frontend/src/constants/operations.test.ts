import { describe, expect, it } from 'vitest'
import src from '../../../backend/src/modules/history/operationLabels.ts?raw'
import { OP_META } from './operations'

// El backend ordena por tipo con sus propias etiquetas (#349): deben ser
// exactamente las que ve el usuario.
describe('OP_META', () => {
  it('las etiquetas coinciden con OPERATION_LABELS del backend', () => {
    const body = src.match(/OPERATION_LABELS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? ''
    const backend = Object.fromEntries([...body.matchAll(/^\s*([A-Z_]+): '([^']+)',/gm)].map(m => [m[1], m[2]]))
    const frontend = Object.fromEntries(Object.entries(OP_META).map(([k, v]) => [k, v.label]))
    expect(Object.keys(backend).length).toBeGreaterThan(20)
    expect(frontend).toEqual(backend)
  })
})

// Nombre por las dos partes de la operación (#488). Mismos casos que
// backend/src/modules/history/operationLabels.test.ts. Datos sintéticos.
import { opMetaOf } from './operations'

describe('opMetaOf', () => {
  const caso = (operation_type: string, asset: string, cost_asset: string | null, extra: Record<string, string | null> = {}) =>
    opMetaOf({ operation_type, asset, cost_asset, ...extra }).label
  it('compra y venta con dinero mantienen su nombre', () => {
    expect(caso('BUY', 'AAA', 'EUR')).toBe('Compra')
    expect(caso('SELL', 'AAA', 'EUR')).toBe('Venta')
    expect(caso('SELL', 'AAA', 'USD')).toBe('Venta')
  })
  it('cripto por cripto o stablecoin es «Permuta», la registre el exchange como compra o como venta', () => {
    expect(caso('BUY', 'AAA', 'BBB')).toBe('Permuta')
    expect(caso('BUY', 'AAA', 'USDT')).toBe('Permuta')
    expect(caso('BUY_CRYPTO', 'AAA', 'BBB')).toBe('Permuta')
    expect(caso('SELL', 'AAA', 'USDC')).toBe('Permuta')
    expect(caso('SELL_CRYPTO', 'AAA', 'BBB')).toBe('Permuta')
  })
  it('comprar dinero entregando cripto es una «Venta»', () => {
    expect(opMetaOf({ operation_type: 'BUY', asset: 'EUR', cost_asset: 'AAA' })).toMatchObject({ label: 'Venta', group: 'sell' })
  })
  it('la permuta conserva el grupo del tipo guardado (recuentos y signos no cambian)', () => {
    expect(opMetaOf({ operation_type: 'BUY', asset: 'AAA', cost_asset: 'BBB' }).group).toBe('buy')
    expect(opMetaOf({ operation_type: 'SELL', asset: 'AAA', cost_asset: 'BBB' }).group).toBe('sell')
  })
  it('retiro a una wallet propia registrada: «Traspaso»; a Wallets externas o sin destino: «Retirada»', () => {
    expect(caso('WITHDRAW', 'AAA', null, { destination_wallet_id: 'w2', destination_wallet_name: 'Fría' })).toBe('Traspaso')
    expect(caso('WITHDRAW', 'AAA', null, { destination_wallet_id: 'w9', destination_wallet_name: 'Wallets externas' })).toBe('Retirada')
    expect(caso('WITHDRAW', 'AAA', null, { destination_wallet_id: null })).toBe('Retirada')
  })
  it('un tipo sin catálogo se muestra tal cual', () => {
    expect(caso('XYZ', 'AAA', null)).toBe('XYZ')
  })
})
