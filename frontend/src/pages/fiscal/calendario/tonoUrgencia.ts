import type { NivelUrgencia } from '../../../utils/cicloFiscal'

// Tono de cada nivel de urgencia (#538): el color acompaña siempre a un texto.
export const TONO_URGENCIA: Record<NivelUrgencia, { trazo: string; texto: string; chip: string }> = {
  urgente: { trazo: 'stroke-negative', texto: 'text-negative-ink', chip: 'bg-negative/12 text-negative-ink' },
  pronto:  { trazo: 'stroke-warning', texto: 'text-warning-ink', chip: 'bg-warning/15 text-warning-ink' },
  normal:  { trazo: 'stroke-brand', texto: 'text-brand-ink', chip: 'bg-brand/12 text-brand-ink' },
  cerrado: { trazo: 'stroke-fg-subtle', texto: 'text-fg-muted', chip: 'bg-overlay/10 text-fg-muted' },
}
