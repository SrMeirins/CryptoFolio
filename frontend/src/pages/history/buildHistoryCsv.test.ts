import { describe, expect, it } from 'vitest'
import { buildHistoryCsv } from './buildHistoryCsv'
import type { Transaction } from '../../api/portfolio'

// Fixture con todos los campos requeridos por la interfaz Transaction;
// los tests solo sobreescriben lo relevante para cada caso.
function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    operation_type: 'BUY',
    timestamp: '2026-01-15T10:30:00.000Z',
    asset: 'BTC',
    amount: '1',
    amount_net: '1',
    cost_asset: 'EUR',
    cost_amount: '100',
    price_per_unit: '100',
    fee_asset: null,
    fee_amount: null,
    wallet_id: '00000000-0000-0000-0000-000000000002',
    wallet_name: 'Binance',
    wallet_color: '#000000',
    wallet_kind: 'exchange',
    account: 'Spot',
    notes: null,
    manually_added: false,
    created_at: '2026-01-15T10:30:00.000Z',
    destination_wallet_id: null,
    destination_wallet_name: null,
    destination_wallet_color: null,
    linked_tx_id: null,
    linked_tx_timestamp: null,
    linked_tx_operation_type: null,
    linked_tx_amount: null,
    linked_tx_asset: null,
    ...overrides,
  }
}

describe('buildHistoryCsv', () => {
  it('genera la cabecera y una fila con los campos esperados separados por ;', () => {
    const csv = buildHistoryCsv([tx({})])
    const [header, row] = csv.split('\n')
    expect(header).toBe('Fecha;Tipo;Activo;Importe;Coste;Activo coste;Precio unitario;Fee;Activo fee;Wallet;Cuenta;Manual;Notas')
    expect(row).toBe('2026-01-15 10:30;BUY;BTC;1;100;EUR;100;;;Binance;Spot;No;')
  })

  it('sanitiza el campo notes si empieza por = (CSV Formula Injection)', () => {
    const csv = buildHistoryCsv([tx({ notes: '=cmd|\'/c calc\'!A0' })])
    const row = csv.split('\n')[1]
    expect(row.endsWith(';\'=cmd|\'/c calc\'!A0')).toBe(true)
  })

  it('sanitiza el activo (asset) si viene de un import sin whitelist con carácter peligroso', () => {
    const csv = buildHistoryCsv([tx({ asset: '=SUM(A1:A9)' })])
    const row = csv.split('\n')[1]
    expect(row).toContain('\'=SUM(A1:A9)')
  })

  it('sanitiza el nombre de wallet si contiene el delimitador ; (no dispara el trigger de fórmula porque no empieza por él, solo se envuelve RFC 4180)', () => {
    const csv = buildHistoryCsv([tx({ wallet_name: 'Mi wallet;=1+1' })])
    const row = csv.split('\n')[1]
    expect(row).toContain('"Mi wallet;=1+1"')
  })

  it('sanitiza cost_asset y fee_asset', () => {
    const csv = buildHistoryCsv([tx({ cost_asset: '@SUM(A1)', fee_asset: '+1+1', fee_amount: '0.1' })])
    const row = csv.split('\n')[1]
    expect(row).toContain('\'@SUM(A1)')
    expect(row).toContain('\'+1+1')
  })

  it('sanitiza account', () => {
    const csv = buildHistoryCsv([tx({ account: '-2+3' })])
    const row = csv.split('\n')[1]
    expect(row).toContain('\'-2+3')
  })

  it('no altera valores normales sin caracteres peligrosos', () => {
    const csv = buildHistoryCsv([tx({ notes: 'compra normal' })])
    const row = csv.split('\n')[1]
    expect(row.endsWith(';compra normal')).toBe(true)
  })
})
