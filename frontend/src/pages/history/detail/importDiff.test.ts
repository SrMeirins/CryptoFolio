import { describe, expect, it } from 'vitest'
import type { ImportOriginal } from '../../../api/portfolio'
import { makeTx } from '../../../test/fixtures/transaction'
import { importDiff } from './importDiff'

// Diferencias original → actual de una importada editada (#378). Datos sintéticos.
const W1 = '00000000-0000-0000-0000-000000000002'
const W2 = '00000000-0000-0000-0000-000000000003'
const names: Record<string, string> = { [W1]: 'Exchange', [W2]: 'Fría' }
const walletName = (id: string) => names[id]

const original: ImportOriginal = {
  operation_type: 'WITHDRAW', timestamp: '2026-01-15T10:30:00+00:00', asset: 'XRP',
  amount: 10, amount_net: 10, cost_asset: null, cost_amount: null, price_per_unit: null,
  fee_asset: null, fee_amount: null, wallet_id: W1, destination_wallet_id: null, destination_pending: true,
}

describe('importDiff (#378)', () => {
  it('sin cambios no hay diferencias (números y fechas en distinto formato)', () => {
    const tx = makeTx({ amount: '10.000000000000000000', amount_net: '10', timestamp: '2026-01-15T10:30:00.000Z' })
    expect(importDiff({ ...tx, destination_pending: true }, original, walletName)).toEqual([])
  })

  it('lista solo los campos cambiados con valores legibles', () => {
    const tx = makeTx({ operation_type: 'LOST', amount: '12', amount_net: '12', wallet_id: W2 })
    const diff = importDiff(tx, original, walletName)
    expect(diff.map(d => d.field)).toEqual(['operation_type', 'amount', 'amount_net', 'wallet_id'])
    expect(diff[0]).toMatchObject({ label: 'Tipo', after: expect.stringMatching(/rdida/) })
    expect(diff[3]).toMatchObject({ before: 'Exchange', after: 'Fría' })
  })

  it('un valor que pasa de vacío a tener valor cuenta como cambio', () => {
    const diff = importDiff(makeTx({ fee_asset: 'XRP', fee_amount: '0.2' }), original, walletName)
    expect(diff.find(d => d.field === 'fee_amount')).toMatchObject({ before: '—' })
  })

  it('una wallet que ya no existe se indica', () => {
    const diff = importDiff(makeTx({ wallet_id: W2 }), { ...original, wallet_id: '00000000-0000-0000-0000-0000000000ff' }, walletName)
    expect(diff[0].before).toBe('Wallet eliminada')
  })

  it('destino pendiente solo se compara si la fila lo trae', () => {
    expect(importDiff(makeTx({}), original, walletName).some(d => d.field === 'destination_pending')).toBe(false)
    expect(importDiff({ ...makeTx({}), destination_pending: false }, original, walletName).some(d => d.field === 'destination_pending')).toBe(true)
  })
})
