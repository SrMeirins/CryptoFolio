import type { WizardResult } from '../../components/OperationWizard'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
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
}

export interface ProgressEvent {
  phase: 'importing' | 'prices' | 'fifo' | 'done' | 'error'
  message: string
  progress?: number
  total?: number
}

export const OPERATION_LABELS: Record<string, string> = {
  BUY: 'Compra',
  SELL: 'Venta',
  DEPOSIT_FIAT: 'Deposito EUR',
  WITHDRAW: 'Retirada',
  INTERNAL_TRANSFER: 'Transferencia interna',
  IGNORED: 'Ignorado',
}

export const OPERATION_COLORS: Record<string, string> = {
  BUY: 'text-accent-green',
  SELL: 'text-accent-red',
  DEPOSIT_FIAT: 'text-accent-blue',
  WITHDRAW: 'text-accent-amber',
  INTERNAL_TRANSFER: 'text-gray-400',
  IGNORED: 'text-gray-600',
}

export const LANG_LABELS: Record<string, string> = {
  en: 'Ingles',
  es: 'Espanol',
  unknown: 'Desconocido',
}

export const ACCOUNT_COLORS: Record<string, string> = {
  'Spot':             '#6366f1',
  'Funding':          '#8b5cf6',
  'Cross Margin':     '#f59e0b',
  'Isolated Margin':  '#e74c3c',
  'Futures':          '#e74c3c',
}

export { type WizardResult }
