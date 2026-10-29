import type { Transaction } from '../../api/portfolio'

// Transacción sintética para tests de render (datos ficticios, sin datos reales).
export function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    operation_type: 'WITHDRAW',
    timestamp: '2026-01-15T10:30:00.000Z',
    asset: 'XRP', amount: '10', amount_net: '10',
    cost_asset: null, cost_amount: null, price_per_unit: null,
    fee_asset: null, fee_amount: null,
    wallet_id: '00000000-0000-0000-0000-000000000002', wallet_name: 'Exchange', wallet_color: '#000000', wallet_kind: 'exchange',
    account: null, notes: null, manually_added: false, original_import: null, created_at: '2026-01-15T10:30:00.000Z',
    destination_wallet_id: null, destination_wallet_name: null, destination_wallet_color: null,
    linked_tx_id: null, linked_tx_timestamp: null, linked_tx_operation_type: null, linked_tx_amount: null, linked_tx_asset: null,
    import_id: null, import_filename: null, tx_hash: null, grouped_fees: [], fee_parent_id: null,
    value_eur: 5, value_source: 'estimado', fee_value_eur: null, fee_value_source: null,
    usd_per_eur: 1.1,
    ...overrides,
  }
}
