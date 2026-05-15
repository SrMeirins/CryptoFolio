import { api } from './client'

export interface FifoLot {
  asset: string
  wallet: string
  quantity: string
  cost_basis_eur: string
  avg_price_eur: string
  oldest_lot: string
  lot_count: string
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

export const portfolioApi = {
  getLots: () => api.get<FifoLot[]>('/fifo/lots'),
  getFiscalSummary: () => api.get<FiscalYear[]>('/fifo/summary'),
  runFifo: () => api.post<{ success: boolean; lotsCreated: number; lotsConsumed: number; totalGainEur: number; totalLossEur: number }>('/fifo/run'),
  getLivePrices: () => api.get<Record<string, number>>('/prices/live'),
  getImports: () => api.get<ImportRecord[]>('/imports'),
  uploadCsv: (file: File) => api.uploadCsv(file),
  deleteImport: (id: string) => api.delete<{ success: boolean }>(`/imports/${id}`),

  // Settings — Assets
  getAssets: () => api.get<AssetMetadata[]>('/settings/assets'),
  createAsset: (data: Partial<AssetMetadata>) => api.post<{ success: boolean; symbol: string }>('/settings/assets', data),
  updateAsset: (symbol: string, data: Partial<AssetMetadata>) => api.post<{ success: boolean }>(`/settings/assets/${symbol}`, data),
  detectPairs: (symbol: string) => api.post<AssetMetadata>(`/settings/assets/${symbol}/detect`, {}),
  testPair: (pair: string) => api.post<{ exists: boolean; price?: number }>('/settings/pairs/test', { pair }),
}
