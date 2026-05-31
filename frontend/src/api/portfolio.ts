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
  wallet: string
  notes: string | null
  manually_added: boolean
  created_at: string
}

export const portfolioApi = {
  getLots: () => api.get<FifoLot[]>('/fifo/lots'),
  getFiscalSummary: () => api.get<FiscalYear[]>('/fifo/summary'),
  runFifo: () => api.post<{ success: boolean; lotsCreated: number; lotsConsumed: number; totalGainEur: number; totalLossEur: number }>('/fifo/run'),
  getLivePrices: () => api.get<Record<string, number>>('/prices/live'),
  getHistoricalPrice: (asset: string, date: string) =>
    api.get<{ asset: string; date: string; price_eur: number }>(`/prices/historical?asset=${asset}&date=${date}`),
  getImports: () => api.get<ImportRecord[]>('/imports'),
  uploadCsv: (file: File) => api.uploadCsv(file),
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
    api.post<{ success: boolean }>('/transactions/manual', data),
  deleteManualTx: (id: string) => api.delete<{ success: boolean }>(`/transactions/${id}`),
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<{ transactions: Transaction[]; total: number }>(`/transactions${qs}`)
  },
  getConfig: () => api.get<Record<string, string>>('/settings/config'),
  setConfig: (key: string, value: string) => api.put<{ success: boolean }>('/settings/config', { key, value }),
  getStats: () => api.get<{
    transactions: number; fifoLots: number; imports: number
    priceCache: number; wallets: number; assets: number
  }>('/settings/stats'),
  clearPriceCache: () => api.delete<{ deleted: number }>('/settings/price-cache'),
  resetAllData: () => api.delete<{ success: boolean }>('/settings/data/transactions'),
}