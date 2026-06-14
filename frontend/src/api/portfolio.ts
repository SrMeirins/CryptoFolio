import { api } from './client'

export interface FifoLot {
  asset: string
  wallet_id: string
  wallet_name: string
  wallet_color: string
  wallet_kind: string
  quantity: string
  cost_basis_eur: string
  avg_price_eur: string
}

export interface LockedAmount {
  wallet_id:    string
  wallet_name:  string
  wallet_color: string
  asset:        string
  staking_type: string
  lock_kind:    'staking' | 'launchpool'
  locked_amount: string
}

export interface FiscalYear {
  fiscal_year: number
  total_gain_loss_eur: string
  total_gains_eur: string
  total_losses_eur: string
  num_operations: string
}

export interface ImportRecord {
  id: string
  filename: string
  imported_at: string
  row_count: number
  skipped_count: number
  transaction_count: string
  date_from: string | null
  date_to: string | null
  buy_count: string
  sell_count: string
  withdraw_count: string
  deposit_count: string
}

export interface AssetMetadata {
  symbol: string
  name: string
  coingecko_id: string | null
  is_stablecoin: boolean
  binance_eur_pair: string | null
  binance_usdt_pair: string | null
  binance_btc_pair: string | null
  price_source: string
  auto_detected: boolean
  last_price_check: string | null
}

export interface ManualTxPreview {
  warnings: string[]
  priceEur: number | null
  estimatedGainLoss: number | null
  affectedLots: {
    lotId: string
    openedAt: string
    consumed: number
    costConsumed: number
    proceedsEur?: number
    pricePerUnit: number
  }[]
  newLot?: {
    asset: string
    quantity: number
    costBasisEur: number
    pricePerUnit: number
  }
  transferLots?: {
    openedAt: string
    moved: number
    pricePerUnit: number
  }[]
}

export interface Transaction {
  id: string
  operation_type: string
  timestamp: string
  asset: string
  amount: string
  amount_net: string
  cost_asset: string | null
  cost_amount: string | null
  price_per_unit: string | null
  fee_asset: string | null
  fee_amount: string | null
  wallet_id: string
  wallet_name: string
  wallet_color: string
  wallet_kind: string
  account: string | null
  notes: string | null
  manually_added: boolean
  created_at: string
  destination_wallet_id: string | null
  destination_wallet_name: string | null
  destination_wallet_color: string | null
  linked_tx_id: string | null
  linked_tx_timestamp: string | null
  linked_tx_operation_type: string | null
  linked_tx_amount: string | null
  linked_tx_asset: string | null
}

export interface FiatBalance {
  wallet_id: string
  wallet_name: string
  wallet_color: string
  wallet_kind: string
  asset: string
  balance: string
}

export const portfolioApi = {
  getLots: () => api.get<FifoLot[]>('/fifo/lots'),
  getLockedAmounts: () => api.get<LockedAmount[]>('/fifo/locked'),
  getFiatBalances: () => api.get<FiatBalance[]>('/fifo/fiat-balances'),
  getFiscalSummary: () => api.get<FiscalYear[]>('/fifo/summary'),
  runFifo: () => api.post<{ success: boolean; lotsCreated: number; lotsConsumed: number; totalGainEur: number; totalLossEur: number }>('/fifo/run'),
  getLivePrices: () => api.get<Record<string, number>>('/prices/live'),
  getHistoricalPrice: (asset: string, date: string) =>
    api.get<{ asset: string; date: string; price_eur: number }>(`/prices/historical?asset=${asset}&date=${date}`),
  getImports: () => api.get<ImportRecord[]>('/imports'),
  deleteImport: (id: string) => api.delete<{ success: boolean }>(`/imports/${id}`),
  getAssets: () => api.get<AssetMetadata[]>('/settings/assets'),
  createAsset: (data: Partial<AssetMetadata>) => api.post<{ success: boolean; symbol: string }>('/settings/assets', data),
  updateAsset: (symbol: string, data: Partial<AssetMetadata>) => api.put<{ success: boolean }>(`/settings/assets/${symbol}`, data),
  deleteAsset: (symbol: string) => api.delete<{ success: boolean }>(`/settings/assets/${symbol}`),
  detectPairs: (symbol: string) => api.post<AssetMetadata>(`/settings/assets/${symbol}/detect`, {}),
  detectAllPairs: () => api.post<{ detected: number; failed: number; total: number }>('/settings/assets/detect-all', {}),
  testPair: (pair: string) => api.post<{ exists: boolean; price?: number }>('/settings/pairs/test', { pair }),
  previewManualTx: (data: Record<string, unknown>) =>
    api.post<ManualTxPreview>('/transactions/manual/preview', data),
  createManualTx: (data: Record<string, unknown>) =>
    api.post<{ success: boolean; fifo?: { lotsCreated: number; lotsConsumed: number; totalGainEur: number; totalLossEur: number } }>('/transactions/manual', data),
  updateManualTx: (id: string, data: Record<string, unknown>) =>
    api.put<{ success: boolean; fifo?: { lotsCreated: number; lotsConsumed: number; totalGainEur: number; totalLossEur: number } }>(`/transactions/${id}`, data),
  deleteManualTx: (id: string) =>
    api.delete<{ success: boolean; fifo?: { lotsCreated: number; lotsConsumed: number } }>(`/transactions/${id}`),
  getTransactions: (params?: Record<string, string | undefined>) => {
    const filtered = params
      ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][])
      : {}
    const qs = Object.keys(filtered).length ? '?' + new URLSearchParams(filtered).toString() : ''
    return api.get<{ transactions: Transaction[]; total: number; total_eur: number; limit: number; offset: number }>(`/transactions${qs}`)
  },
  getTransactionStats: () => api.get<{
    totals: {
      total_ops: number; unique_assets: number; total_invested: number
      total_fee_ops: number; total_fees_eur: number; total_buys: number; total_sells: number; total_manual: number
    }
    monthly: { mes: string; total_ops: number; compras: number; ventas: number; ingresos: number; transferencias: number; eur_invertido: number }[]
    topAssets: { asset: string; ops: number; eur_volume: number }[]
    fees: { asset: string; ops: number; total_amount: number; total_eur: number }[]
  }>('/transactions/stats'),
  getWallets: () => api.get<unknown[]>('/wallets'),
  getNetworks: () => api.get<unknown[]>('/wallets/networks'),
  createWallet: (data: Record<string, unknown>) => api.post<{ id: string }>('/wallets', data),
  updateWallet: (id: string, data: Record<string, unknown>) => api.put<{ success: boolean }>(`/wallets/${id}`, data),
  deleteWallet: (id: string) => api.delete<{ success: boolean }>(`/wallets/${id}`),
  createAddress: (walletId: string, data: Record<string, unknown>) => api.post<{ id: string }>(`/wallets/${walletId}/addresses`, data),
  updateAddress: (walletId: string, addressId: string, data: Record<string, unknown>) => api.put<{ success: boolean }>(`/wallets/${walletId}/addresses/${addressId}`, data),
  deleteAddress: (walletId: string, addressId: string) => api.delete<{ success: boolean }>(`/wallets/${walletId}/addresses/${addressId}`),
  exportBackup: () => api.get<Record<string, unknown>>('/settings/backup'),
  getConfig: () => api.get<Record<string, string>>('/settings/config'),
  setConfig: (key: string, value: string) => api.put<{ success: boolean }>('/settings/config', { key, value }),
  getStats: () => api.get<{
    transactions: number; fifoLots: number; imports: number
    priceCache: number; wallets: number; assets: number
  }>('/settings/stats'),
  clearPriceCache: () => api.delete<{ deleted: number }>('/settings/price-cache'),
  resetAllData: () => api.delete<{ success: boolean }>('/settings/data/transactions'),
  getRealizedPnl: () => api.get<{
    totalGains:  number
    totalLosses: number
    netPnl:      number
    byAsset: {
      asset:          string
      operations:     number
      realized_gains: string
      realized_losses:string
      net_pnl:        string
      total_sold:     string
      first_sale:     string
      last_sale:      string
    }[]
  }>('/fifo/realized-pnl'),
  getEurFlow: () => api.get<{
    deposited: number
    withdrawn: number
    netFromBank: number
    eurSpentBuying: number
    eurReceivedSelling: number
    netInvested: number
  }>('/fifo/eur-flow'),
  getNotifications: () => api.get<Array<{
    id: string; type: 'error' | 'warning' | 'info'; category: string; message: string; count?: number;
  }>>('/settings/notifications'),
  getYesterdayPrices: () => api.get<{ prices: Record<string, number> }>('/fifo/yesterday-prices'),
  getPortfolioHistory: (period: string) => api.get<{
    points: { date: string; value: number }[]
    period: string
    refreshing: boolean
  }>(`/fifo/portfolio-history?period=${period}`),
  getPendingDeposits: () => api.get<Array<{
    id: string; timestamp: string; asset: string; amount: string;
    wallet_name: string; historicalPrice: number | null;
  }>>('/settings/pending-deposits'),
  bulkSetCosts: (updates: { id: string; pricePerUnit: number }[]) =>
    api.post<{ success: boolean; updated: number; fifo: unknown }>('/settings/bulk-set-costs', { updates }),
}