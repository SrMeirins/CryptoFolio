import type { ReactNode } from 'react'
import { Clock, Sun } from 'lucide-react'
import { InfoTooltip } from './InfoTooltip'
import { WINDOW_LABELS, type ChipTone, type ChipWindow } from '../utils/windowChip'

// Chip común de «Hoy» y «24 h» en las tarjetas de resumen (#247): la ventana
// siempre visible, con su icono, y el detalle en el tooltip. El signo se lee
// en el texto (flecha o +/−), no solo en el color.

const ICONS: Record<ChipWindow, typeof Sun> = { today: Sun, '24h': Clock }

const FRAMES: Record<ChipTone, string> = {
  positive: 'bg-positive/8 border-positive/25 text-positive',
  negative: 'bg-negative/8 border-negative/25 text-negative',
  neutral: 'border-border text-fg-subtle',
}

export function WindowChip({ window, tone, triggerLabel, children, tooltip }: {
  window: ChipWindow
  tone: ChipTone
  /** Nombre accesible completo, p. ej. «Variación 24 h: +146 € (+1,2 %)». */
  triggerLabel: string
  /** Cifras del chip. */
  children: ReactNode
  /** Detalle del tooltip; debajo se añade siempre qué mide la ventana. */
  tooltip?: ReactNode
}) {
  const { label, title, help } = WINDOW_LABELS[window]
  const Icon = ICONS[window]
  return (
    <InfoTooltip
      label={title}
      triggerLabel={triggerLabel}
      trigger={
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-xs leading-none whitespace-nowrap ${FRAMES[tone]}`}>
          <Icon size={11} strokeWidth={2.25} aria-hidden="true" className="shrink-0 opacity-80" />
          <span className="font-medium">{label}</span>
          <span className="mono font-semibold">{children}</span>
        </span>
      }>
      {tooltip}
      <p className={tooltip ? 'mt-1.5 text-fg-subtle' : 'text-fg-subtle'}>{help}</p>
    </InfoTooltip>
  )
}
