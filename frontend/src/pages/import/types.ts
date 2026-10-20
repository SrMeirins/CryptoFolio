import type { WizardResult } from '../../components/OperationWizard'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  info: string[]           // mensajes informativos (sin acción requerida)
  detectedLanguage: string
  unknownOperations: string[]
  rowCount: number
  dateRange: { from: string; to: string } | null
}

export interface PreviewTransaction {
  operationType: string
  timestamp: string
  asset: string
  amount: number
  amountNet: number
  costAsset?: string
  costAmount?: number
  pricePerUnit?: number
  feeAsset?: string
  feeAmount?: number
  account: string
  notes?: string
  subTradeCount: number
  rawRowHashes?: string[]
  /** Fila nueva (no estaba importada); la marca el backend (#316). */
  isNew?: boolean
  /** Destino on-chain de un retiro, si el CSV lo trae (#320). */
  destino?: DestinoRetiro
}

export interface DestinoRetiro {
  address: string | null
  networkId: string | null
  network: string | null
  txHash: string | null
}

export interface UnknownOperationSample {
  timestamp: string
  asset: string
  amount: number
  originalLabel: string
}

export interface DepositReview {
  txKey: string
  timestamp: string
  asset: string
  amount: number
  historicalPrice: number | null
  existingInDb?: boolean
}

export interface PreviewResult {
  validation: ValidationResult
  transactions: PreviewTransaction[]
  duplicateCount: number
  newCount: number
  errors: string[]
  unknownOperationSamples: Record<string, UnknownOperationSample>
  depositReviews: DepositReview[]
  /** Exchange con el que se ha leído el archivo (detectado o elegido) (#318). */
  exchange?: 'binance' | 'bitvavo'
  deteccion?: { exchange: 'binance' | 'bitvavo' | null; idioma: string; reconocido: boolean; esperadas: Record<'binance' | 'bitvavo', string> }
  /** Historial de retiradas de Binance aportado (#320). */
  retiradas?: { filas: number; emparejadas: number; retiros: number } | null
}

export interface ProgressEvent {
  phase: 'importing' | 'prices' | 'fifo' | 'done' | 'error'
  message: string
  progress?: number
  total?: number
  /** Segundos de espera por rate limit de CoinGecko (#324). */
  espera?: number
  /** Avance sin interés para el log técnico (#324). */
  soloProgreso?: boolean
  /** Resumen estructurado del evento final (#324). */
  resumen?: ResumenImportacion
  /** Instante de recepción en el cliente (ms), para la cuenta atrás. */
  t?: number
}

export interface ResumenImportacion {
  importId: string
  archivo: string
  nuevas: number
  duplicadas: number
  precios: { necesarios: number; obtenidos: number; sinPrecio: { activo: string; fecha: string }[] }
  avisos: { tipo: 'sin_compras' | 'transferencia' | 'lote_sintetico' | 'otro'; activo: string | null; veces: number; mensaje: string }[]
  impacto: { year: number; antes: number; despues: number }[]
}

export const LANG_LABELS: Record<string, string> = {
  en: 'Inglés',
  es: 'Español',
  unknown: 'Desconocido',
}

export const ACCOUNT_COLORS: Record<string, string> = {
  'Spot':             '#6366f1',
  'Funding':          '#8b5cf6',
  'Cross Margin':     '#f59e0b',
  'Isolated Margin':  '#e74c3c',
  'Futures':          '#e74c3c',
  'Bitvavo':          '#273A75',
}

export { type WizardResult }
