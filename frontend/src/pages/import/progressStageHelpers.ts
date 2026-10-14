import { FileText, HardDrive, CheckCircle, RefreshCw } from 'lucide-react'

export const PHASES = [
  { key: 'importing', label: 'Importando',   icon: FileText    },
  { key: 'prices',    label: 'Precios hist.', icon: RefreshCw   },
  { key: 'fifo',      label: 'Cálculo FIFO',  icon: HardDrive   },
  { key: 'done',      label: 'Completado',    icon: CheckCircle },
] as const

export type PhaseStatus = 'error' | 'done' | 'current' | 'pending'

export const PHASE_STATUS_STYLES: Record<PhaseStatus, {
  border: string
  iconBg: string
  iconColor: string
  text: string
  bar: string
}> = {
  error:   { border: 'border-negative/40 bg-negative/5',     iconBg: 'bg-negative/15',       iconColor: 'text-negative',   text: 'text-negative',   bar: 'bg-negative' },
  done:    { border: 'border-positive/30 bg-positive/5', iconBg: 'bg-positive/15',     iconColor: 'text-positive', text: 'text-positive', bar: 'bg-positive' },
  current: { border: 'border-brand/40 bg-brand/5',   iconBg: 'bg-brand/15',      iconColor: 'text-brand',  text: 'text-brand',  bar: 'bg-brand-solid' },
  pending: { border: 'border-border bg-background-tertiary/30',  iconBg: 'bg-background-tertiary', iconColor: 'text-fg-subtle',     text: 'text-fg-subtle',     bar: '' },
}

export type BannerKind = 'rateLimit' | 'prefetch' | 'normal'

export const BANNER_STYLES: Record<BannerKind, { container: string; icon: string; text: string }> = {
  rateLimit: { container: 'bg-orange-950/40 border border-orange-500/30',     icon: 'text-orange-400', text: 'text-orange-300' },
  prefetch:  { container: 'bg-accent-purple/40 border border-accent-purple/30',     icon: 'text-accent-purple', text: 'text-accent-purple' },
  normal:    { container: 'bg-background-tertiary border border-transparent', icon: 'text-brand', text: 'text-fg' },
}
