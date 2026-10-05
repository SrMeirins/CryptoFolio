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
  error:   { border: 'border-accent-red/40 bg-accent-red/5',     iconBg: 'bg-accent-red/15',       iconColor: 'text-accent-red',   text: 'text-accent-red',   bar: 'bg-accent-red' },
  done:    { border: 'border-accent-green/30 bg-accent-green/5', iconBg: 'bg-accent-green/15',     iconColor: 'text-accent-green', text: 'text-accent-green', bar: 'bg-accent-green' },
  current: { border: 'border-accent-blue/40 bg-accent-blue/5',   iconBg: 'bg-accent-blue/15',      iconColor: 'text-accent-blue',  text: 'text-accent-blue',  bar: 'bg-accent-blue' },
  pending: { border: 'border-border bg-background-tertiary/30',  iconBg: 'bg-background-tertiary', iconColor: 'text-gray-600',     text: 'text-gray-600',     bar: '' },
}

export type BannerKind = 'rateLimit' | 'prefetch' | 'normal'

export const BANNER_STYLES: Record<BannerKind, { container: string; icon: string; text: string }> = {
  rateLimit: { container: 'bg-orange-950/40 border border-orange-500/30',     icon: 'text-orange-400', text: 'text-orange-300' },
  prefetch:  { container: 'bg-purple-950/40 border border-purple-500/30',     icon: 'text-purple-400', text: 'text-purple-300' },
  normal:    { container: 'bg-background-tertiary border border-transparent', icon: 'text-accent-blue', text: 'text-gray-300' },
}
