import { api } from './client'
import type { Currency } from '../utils/format'
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

export interface DailyPnlDay {
  date: string
  value: number
  inflow: number
  outflow: number
  netCapitalFlow: number
  capitalIn: number    // depósitos de capital propio del día (sin margen)
  capitalOut: number   // retiradas de capital propio del día (positivo)
  pnl: number
  pct: number | null
  cumulativePct: number
  cumulativeDietzPct: number
  cumulativePeakCapitalPct: number
  complete: boolean
  live: boolean
}

export interface DailyPnlResponse {
  currency: Currency
  from: string
  to: string
  timezone: 'Europe/Madrid'
  refreshing: boolean
  totalPnl: number
  twrPct: number
  dietzPct: number
  peakCapitalPct: number
  days: DailyPnlDay[]
  // Base del día en curso para recalcularlo con los precios en vivo (#213); null si hoy no está en el rango.
  today: LiveDayBase | null
}

export interface DayDetailResponse {
  date: string
  currency: Currency
  live: boolean
  complete: boolean
  value: number
  pnl: number
  pct: number | null
  inflow: number
  outflow: number
  contributions: Array<{ asset: string; pnl: number }>   // de mayor a menor aportación
  other: number                                          // operaciones del día y otros
}

export interface IntradayPnlResponse {
  currency: Currency
  from: string
  to: string
  stepMinutes: 15
  totalPnl: number
  twrPct: number
  approximate: string[]   // activos valorados con el precio en vivo en toda la ventana
  points: Array<{ at: string; value: number; pnl: number; pct: number; stepPct: number | null; flow: number; capitalIn: number; capitalOut: number; live: boolean }>
}

export interface LiveDayBase {
  date: string
  previousValue: number              // cierre de ayer, en la moneda de la respuesta
  holdings: Record<string, number>   // tenencias actuales por activo de precio ('EUR' = euros)
  flows: Array<{ asset: string; quantity: number }>  // flujos de capital de hoy (+ entrada, − salida)
  pricesEur: Record<string, number>  // precios que usó el servidor, de respaldo
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
  // Coste y precio medio en USD con el tipo de apertura de cada lote (#174/#175).
  cost_basis_usd?: string | null
  avg_price_usd?: string | null
  /** Fecha media de apertura de los lotes ponderada por coste (#283). */
  avg_opened_at?: string | null
}

/** Lote FIFO abierto de un activo (#272), para el panel de detalle de Portfolio. */
export interface OpenLot {
  wallet_id: string
  wallet_name: string
  wallet_color: string
  wallet_kind: string
  opened_at: string
  quantity_original: string
  quantity_remaining: string
  price_per_unit_eur: string
  cost_basis_eur: string
  /** Tipo USD por EUR de la fecha de apertura (#174); null si no lo hubo. */
  usd_per_eur: string | null
  source_type: string
}

/** Venta o permuta de un activo, con sus consumos FIFO agrupados (#284). */
export interface AssetSale {
  soldAt: string
  kind: 'venta' | 'permuta'
  quantity: number
  priceEur: number
  proceedsEur: number
  gainLossEur: number
}

export interface AssetSales {
  asset: string
  /** Ventas y permutas (una por operación). */
  count: number
  /** Realizado fiscal en EUR: coincide con Fiscal (incluye comisiones pagadas con el activo). */
  realizedEur: number
  /** Parte del realizado que no viene de ventas ni permutas (comisiones, margen…). */
  otherRealizedEur: number
  lastSaleAt: string | null
  sales: AssetSale[]
}

/** Planificador de fin de año (#307). */
export interface FiscalPlanner {
  year: number
  netoAnio: number
  rendimientosAnio: number
  cuotaActual: number
  /** Ganancia realizable este año sin que suba la cuota. */
  colchon: number
  pendienteVigente: number
  caducanEsteAnio: number
  lotes: import('../utils/planificador').PlanLot[]
  /** Activo → última adquisición de los últimos 2 meses (regla de recompra). */
  comprasRecientes: Record<string, string>
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
  // USD por EUR en la fecha de la operación (#175), para mostrar importes en EUR en dólares.
  usd_per_eur?: number | string | null
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
  /** Comisión de venta atribuida al lote (#279). */
  feeEur:            number
  /** El lote solo se vende en parte. */
  partial:           boolean
  gainLossEur:       number
}

/** Tramo del IRPF que atraviesa la venta (#279); negativo si la venta reduce la base. */
export interface TramoMarginal { tipo: number; desde: number; hasta: number; base: number; cuota: number }

export interface SimulationResult {
  asset:          string
  quantity:       number
  priceEur:       number
  feePct:         number
  /** Wallet donde se simula la venta: FIFO de sus lotes (#279). */
  walletId:       string
  wallets:        Array<{ walletId: string; walletName: string; quantity: number }>
  totalProceeds:  number   // bruto
  totalFee:       number
  netProceeds:    number   // bruto − comisión
  totalCostBasis: number
  totalGain:      number
  totalLoss:      number
  netGainLoss:    number
  irpfEstimate:   number
  /** IRPF marginal sobre la base del ahorro del ejercicio (#279). */
  irpf: { year: number; baseAntes: number; baseDespues: number; marginal: number; desglose: TramoMarginal[] }
  /** Compras reales del activo en los 2 meses anteriores (regla de recompra). */
  recompra: { aviso: boolean; comprasRecientes: string[] }
  /** Importe neto de comisión menos el IRPF que genere (#280). */
  netoEnMano:     number
  /** Ganancia o pérdida tras comisión e IRPF (un ahorro de IRPF reduce la pérdida). */
  resultadoNeto:  number
  lotsConsumed:   SimulatedLot[]
}

export interface SimulationCurvePoint { price: number; netGainLoss: number; irpf: number; netoEnMano: number; resultadoNeto: number }

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
  getOpenLots: (asset: string) => api.get<{ asset: string; lots: OpenLot[] }>(`/v1/fifo/lots/${encodeURIComponent(asset)}`),
  getAssetSales: (asset: string) => api.get<AssetSales>(`/v1/fifo/sales/${encodeURIComponent(asset)}`),
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
  getTransactions: (params?: Record<string, string | undefined>, currency: Currency = 'EUR') => {
    const filtered = params
      ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][])
      : {}
    if (currency !== 'EUR') filtered.currency = currency
    const qs = Object.keys(filtered).length ? '?' + new URLSearchParams(filtered).toString() : ''
    return api.get<{
      transactions: Transaction[]; total: number; total_eur: number; limit: number; offset: number
      currency?: Currency; total_amount?: number
    }>(`/transactions${qs}`)
  },
  getTransactionStats: (currency: Currency = 'EUR') => api.get<{
    currency?: Currency
    totals: {
      total_ops: number; unique_assets: number; total_invested: number
      total_fee_ops: number; total_fees_eur: number; total_buys: number; total_sells: number; total_manual: number
    }
    monthly: { mes: string; total_ops: number; compras: number; ventas: number; ingresos: number; transferencias: number; eur_invertido: number }[]
    topAssets: { asset: string; ops: number; eur_volume: number }[]
    fees: { asset: string; ops: number; total_amount: number; total_eur: number }[]
  }>(`/transactions/stats?currency=${currency}`),
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
  getEurFlow: (currency: Currency = 'EUR') => api.get<{
    currency?: Currency
    deposited: number
    withdrawn: number
    netFromBank: number
    eurSpentBuying: number
    eurReceivedSelling: number
    netInvested: number
  }>(`/fifo/eur-flow?currency=${currency}`),
  getNotifications: () => api.get<Notification[]>('/settings/notifications'),
  // P&L diario por día local (Europe/Madrid), #165/#166. Sin `from`: desde la primera actividad.
  getDailyPnl: (from?: string, to?: string, currency: Currency = 'EUR') => {
    const params = new URLSearchParams({ currency })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const query = params.toString()
    return api.get<DailyPnlResponse>(`/v1/pnl/daily${query ? `?${query}` : ''}`)
  },
  // Detalle de un día del calendario de P&L (#216).
  getDayDetail: (date: string, currency: Currency = 'EUR') => api.get<DayDetailResponse>(`/v1/pnl/day?${new URLSearchParams({ date, currency })}`),
  // Evolución de las últimas 24 h cada 15 min (#215).
  getIntradayPnl: (currency: Currency = 'EUR') => api.get<IntradayPnlResponse>(`/v1/pnl/intraday?${new URLSearchParams({ currency })}`),
  getPendingDeposits: () => api.get<Array<{
    id: string; timestamp: string; asset: string; amount: string;
    wallet_name: string; historicalPrice: number | null;
  }>>('/settings/pending-deposits'),
  bulkSetCosts: (updates: { id: string; pricePerUnit: number }[]) =>
    api.post<{ success: boolean; updated: number; fifo: unknown }>('/settings/bulk-set-costs', { updates }),
  simulateSale: (asset: string, quantity: number, priceEur: number, walletId?: string, feePct?: number) =>
    api.post<SimulationResult>('/fiscal/simulate-sale', { asset, quantity, priceEur, walletId, feePct }),
  // Resultado neto por precio (#280) y cantidad para un neto en mano.
  simulateSaleCurve: (asset: string, quantity: number, prices: number[], walletId?: string, feePct?: number) =>
    api.post<{ quantity: number; points: SimulationCurvePoint[] }>('/fiscal/simulate-sale/curve', { asset, quantity, prices, walletId, feePct }),
  simulateSaleQuantity: (asset: string, priceEur: number, targetNet: number, walletId?: string, feePct?: number) =>
    api.post<{ quantity: number; netoEnMano: number; alcanzable: boolean }>('/fiscal/simulate-sale/quantity', { asset, priceEur, targetNet, walletId, feePct }),
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
  /** Planificador de fin de año (#307): contexto del ejercicio en curso y lotes abiertos en orden FIFO. */
  getFiscalPlanner: () => api.get<FiscalPlanner>('/fiscal/planificador'),
  /** Cuota del ejercicio en curso con cada ganancia (o pérdida) adicional (máx. 200). */
  getFiscalCuotas: (ganancias: number[]) => api.post<{ cuotaBase: number; cuotas: number[] }>('/fiscal/planificador/cuotas', { ganancias }),
  /** Neto del ejercicio hasta un día de Madrid (MM-DD), para comparar periodos (#297). */
  getFiscalNetoHasta: (year: number, hasta: string) =>
    api.get<{ year: number; hasta: string; neto: number; ganancias: number; perdidas: number; operaciones: number }>(`/fiscal/${year}/neto-hasta?hasta=${encodeURIComponent(hasta)}`),
}