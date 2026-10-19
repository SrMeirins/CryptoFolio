import { calcularTramos, type Tramo } from './tramosIrpf'
import type { FiscalHito } from '../api/portfolio'

// Panel fiscal del Dashboard (#236). Funciones puras.

export type DeadlineStatus = 'pending' | 'open'

export interface Deadline {
  label: string
  opens: string          // apertura (YYYY-MM-DD); en la renta, estimada
  opensApprox: boolean   // la AEAT fija cada año el día exacto de apertura
  date: string           // cierre del plazo
  days: number           // días hasta el cierre
  status: DeadlineStatus
  daysToOpen: number     // 0 si ya está abierto
  progress: number       // % del plazo transcurrido (0 si no ha abierto)
}

/**
 * Próximo plazo para el panel del Dashboard a partir del hito del calendario
 * fiscal del backend (#309): así Fiscal, Dashboard y campana muestran el mismo.
 */
export function deadlineFromHito(h: FiscalHito): Deadline {
  return {
    label: h.titulo,
    opens: h.desde,
    opensApprox: h.inicioAproximado,
    date: h.hasta,
    days: h.diasRestantes,
    status: h.estado === 'en-curso' ? 'open' : 'pending',
    daysToOpen: h.diasParaAbrir,
    progress: h.progreso,
  }
}

/** Urgencia del cierre para el color: más de 30 días, hasta 30 o la última semana. */
export function deadlineUrgency(d: Deadline): 'calm' | 'soon' | 'urgent' {
  if (d.status === 'pending' || d.days > 30) return 'calm'
  return d.days > 7 ? 'soon' : 'urgent'
}

/** Cuota IRPF estimada sobre la base del ahorro (ya compensada); 0 si no hay base positiva. */
export function estimatedTax(base: number, tramos?: Tramo[]): number {
  if (!(base > 0)) return 0
  return Math.round(calcularTramos(base, tramos).reduce((s, t) => s + t.cuota, 0) * 100) / 100
}

/** Peso de ganancias y pérdidas (en valor absoluto) para la barra comparativa, en %. */
export function gainLossShares(gains: number, losses: number): { gains: number; losses: number } {
  const g = Math.abs(gains)
  const l = Math.abs(losses)
  const total = g + l
  return total > 0 ? { gains: (g / total) * 100, losses: (l / total) * 100 } : { gains: 0, losses: 0 }
}
