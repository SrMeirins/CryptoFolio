import { api } from './client'
// Tipos del módulo fiscal detallado (pages/fiscal/) — viven ahí por ser
// específicos de ese dominio, no en api/portfolio.ts; se importan aquí solo
// para tipar los métodos de red, igual que ya se hacía desde pages/fiscal/
// para el resto de tipos de esta API.
import type {
  FiscalSummary, FiscalEvent, RendimientoEvent, Modelo721,
  YearOverview, Carryforward, BreakdownItem, MonthlyData,
} from '../pages/fiscal/types'

// Resultado del motor FIFO (backend/src/modules/fifo/engine.ts). Lo devuelven
// tal cual /fifo/run y, anidado bajo `fifo`, los 3 endpoints de transacción
// manual — antes había 3 copias inline de esta forma en este fichero, una de
// ellas (deleteManualTx) desincronizada (solo 2 de los 4 campos reales).
export interface FifoRunResult {
  lotsCreated:  number
  lotsConsumed: number
  totalGainEur: number
  totalLossEur: number
}

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

export interface SimulatedLot {
  lotId:             string
  walletName:        string
  openedAt:          string
  qtyAvailable:      number
  qtyConsumed:       number
  costBasisConsumed: number
  pricePerUnit:      number
  proceedsEur:       number
  gainLossEur:       number
}

export interface SimulationResult {
  asset:          string
  quantity:       number
  priceEur:       number
  totalProceeds:  number
  totalCostBasis: number
  totalGain:      number
  totalLoss:      number
  netGainLoss:    number
  irpfEstimate:   number
  lotsConsumed:   SimulatedLot[]
}

// Forma mínima común de wallet que necesita el wizard de operaciones
// (constants/operations.ts la consume para el selector). La pantalla de
// gestión de wallets (pages/settings/wallets/) necesita un tipo más
// completo (con addresses/notes/is_default) — ver WalletFull más abajo.
// Ambas queries comparten la queryKey 'wallets', así que React Query
// cachea/deduplica entre ambas aunque los tipos no coincidan.
export interface Wallet {
  id:        string
  name:      string
  type:      string
  color:     string
  is_system: boolean
}

export interface WalletAddressSyncDetail {
  asset: string
  onchain_balance: number | null
  expected_balance: number
  checked_at: string
  status: 'ok' | 'discrepancy' | 'error'
}

export interface WalletAddress {
  id: string
  network_name: string | null
  network_native_asset: string | null
  custom_network: string | null
  address: string | null
  explorer_url: string | null
  sync_status: 'ok' | 'discrepancy' | 'error' | 'pending'
  sync_details: WalletAddressSyncDetail[]
}

// Forma completa de wallet (con direcciones) que usa la pantalla de
// gestión de wallets — la lista `Wallet[]` de arriba es la forma mínima
// que consumen selectores/wizards.
export interface WalletFull {
  id: string
  name: string
  type: string
  is_system: boolean
  is_default: boolean
  color: string
  notes: string | null
  addresses: WalletAddress[]
}

export interface Network {
  id: string
  name: string
  native_asset: string
  explorer_url: string | null
  tokens: { id: string; asset: string }[]
}

export interface FieldDefinition {
  name: string
  label: string
  required: boolean
  auto?: boolean
  type: 'asset' | 'number' | 'wallet' | 'datetime' | 'text' | 'select'
  placeholder?: string
  hint?: string
  options?: { value: string; label: string }[]
}

export interface OperationType {
  id: string
  category: string
  label: string
  description: string
  helper: string
  fiscalHelper: string
  fiscalTreatment: string
  fifoEffect: string
  fields: FieldDefinition[]
  example?: string
  badge: string
  badgeColor: 'green' | 'red' | 'blue' | 'gray' | 'amber'
}

export interface CategoryMeta { label: string; description: string; icon: string }

export interface CatalogData {
  categories: Record<string, CategoryMeta>
  operations: OperationType[]
}

export interface FiatBalance {
  wallet_id: string
  wallet_name: string
  wallet_color: string
  wallet_kind: string
  asset: string
  balance: string
}

export interface Notification {
  id: string
  type: 'error' | 'warning' | 'info'
  category: string
  message: string
  count?: number
}

export const portfolioApi = {
  getLots: () => api.get<FifoLot[]>('/fifo/lots'),
  getLockedAmounts: () => api.get<LockedAmount[]>('/fifo/locked'),
  getFiatBalances: () => api.get<FiatBalance[]>('/fifo/fiat-balances'),
  getFiscalSummary: () => api.get<FiscalYear[]>('/fifo/summary'),
  runFifo: () => api.post<{ success: boolean } & FifoRunResult>('/fifo/run'),
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
  testCoinGeckoId: (id: string) => api.get<{ id: string; price_eur: number | null; valid: boolean }>(`/settings/coingecko/test?id=${encodeURIComponent(id)}`),
  updateCoinGeckoId: (symbol: string, coingecko_id: string) => api.put<{ symbol: string; coingecko_id: string; price_eur: number }>(`/settings/assets/${symbol}/coingecko-id`, { coingecko_id }),
  searchCoinGecko: (symbol: string) => api.get<{ found: boolean; coingecko_id?: string; price_eur?: number }>(`/settings/coingecko/search?symbol=${encodeURIComponent(symbol)}`),
  previewManualTx: (data: Record<string, unknown>) =>
    api.post<ManualTxPreview>('/transactions/manual/preview', data),
  // Los 3 endpoints, verificados contra backend/src/routes/transactions.ts:
  // `fifo` siempre viene (nunca `undefined`) — es `null` en vez de ausente
  // cuando el recálculo FIFO falla, y en ese caso viene también `fifoError`
  // con el motivo (antes ninguno de los 3 tipos declaraba `fifoError`, así
  // que ese fallo se perdía en silencio para quien llamaba).
  createManualTx: (data: Record<string, unknown>) =>
    api.post<{ success: boolean; fifo: FifoRunResult | null; fifoError?: string }>('/transactions/manual', data),
  updateManualTx: (id: string, data: Record<string, unknown>) =>
    api.put<{ success: boolean; fifo: FifoRunResult | null; fifoError?: string }>(`/transactions/${id}`, data),
  deleteManualTx: (id: string) =>
    api.delete<{ success: boolean; fifo: FifoRunResult | null; fifoError?: string }>(`/transactions/${id}`),
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
  getWallets: () => api.get<Wallet[]>('/wallets'),
  getWalletsFull: () => api.get<WalletFull[]>('/wallets'),
  getCatalog: () => api.get<CatalogData>('/catalog'),
  getNetworks: () => api.get<Network[]>('/wallets/networks'),
  createWallet: (data: Record<string, unknown>) => api.post<{ id: string }>('/wallets', data),
  updateWallet: (id: string, data: Record<string, unknown>) => api.put<{ success: boolean }>(`/wallets/${id}`, data),
  deleteWallet: (id: string) => api.delete<{ success: boolean }>(`/wallets/${id}`),
  createAddress: (walletId: string, data: Record<string, unknown>) => api.post<{ id: string }>(`/wallets/${walletId}/addresses`, data),
  updateAddress: (walletId: string, addressId: string, data: Record<string, unknown>) => api.put<{ success: boolean }>(`/wallets/${walletId}/addresses/${addressId}`, data),
  deleteAddress: (walletId: string, addressId: string) => api.delete<{ success: boolean }>(`/wallets/${walletId}/addresses/${addressId}`),
  syncAddress: (walletId: string, addressId: string) =>
    api.post<Array<{ asset: string; status: string; onchainBalance: number | null; expectedBalance: number; discrepancyPct: number | null }>>(
      `/wallets/${walletId}/addresses/${addressId}/sync`, {}
    ),
  getNetworkApiKeyStatus: (networkId: string) =>
    api.get<{ network_id: string; has_key: boolean; updated_at: string | null }>(`/wallets/networks/${networkId}/api-key`),
  setNetworkApiKey: (networkId: string, apiKey: string) =>
    api.put<{ success: boolean }>(`/wallets/networks/${networkId}/api-key`, { api_key: apiKey }),
  deleteNetworkApiKey: (networkId: string) =>
    api.delete<{ success: boolean }>(`/wallets/networks/${networkId}/api-key`),
  exportBackup: () => api.get<Record<string, unknown>>('/settings/backup'),
  getConfig: () => api.get<Record<string, string>>('/settings/config'),
  setConfig: (key: string, value: string) => api.put<{ success: boolean }>('/settings/config', { key, value }),
  getStats: () => api.get<{
    transactions: number; fifoLots: number; imports: number
    priceCache: number; wallets: number; assets: number
  }>('/settings/stats'),
  // El backend exige { confirm: true } en estos dos borrados destructivos de
  // alcance amplio (ver routes/settings/settingsShared.ts, requireConfirm) —
  // la UI ya pide confirmación al usuario antes de llamar a estas funciones
  // (DatosSection.tsx: resetAllData tras escribir "CONFIRMAR").
  clearPriceCache: () => api.delete<{ deleted: number }>('/settings/price-cache', { confirm: true }),
  clearFailedPrices: (asset?: string) => api.delete<{ deleted: number }>(
    `/settings/price-cache/failed${asset ? `?asset=${encodeURIComponent(asset)}` : ''}`
  ),
  fixStaleWithdrawals: () => api.post<{ fixed: number; records: { id: string; asset: string; timestamp: string }[] }>('/settings/transactions/fix-stale-withdrawals', {}),
  resetAllData: () => api.delete<{ success: boolean }>('/settings/data/transactions', { confirm: true }),
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
  getNotifications: () => api.get<Notification[]>('/settings/notifications'),
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
  simulateSale: (asset: string, quantity: number, priceEur: number) =>
    api.post<SimulationResult>('/fiscal/simulate-sale', { asset, quantity, priceEur }),
  // Módulo fiscal detallado (pages/fiscal/Fiscal.tsx) — antes estas 8
  // llamadas usaban un fetchOk() local propio del fichero, sin pasar por
  // este cliente: sin el timeout de 30s del Nivel 2 ni el manejo de error
  // estandarizado del resto de la app.
  getFiscalYears: () => api.get<number[]>('/fiscal/years'),
  getFiscalOverview: () => api.get<YearOverview[]>('/fiscal/overview'),
  getFiscalCarryforward: () => api.get<Carryforward>('/fiscal/carryforward'),
  getFiscalSummaryDetail: (year: number) => api.get<FiscalSummary>(`/fiscal/${year}/summary`),
  getFiscalEvents: (year: number) =>
    api.get<{ fiscalEvents: FiscalEvent[]; rendimientos: RendimientoEvent[] }>(`/fiscal/${year}/events`),
  getFiscalModelo721: (year: number) => api.get<Modelo721>(`/fiscal/${year}/modelo721`),
  getFiscalBreakdown: (year: number) => api.get<BreakdownItem[]>(`/fiscal/${year}/breakdown`),
  getFiscalMonthly: (year: number) => api.get<MonthlyData>(`/fiscal/${year}/monthly`),
}