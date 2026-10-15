import { calcularTramos, type Tramo } from './tramosIrpf'

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

const DAY_MS = 86_400_000
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

// Apertura estimada de la campaña de la renta: principios de abril (en la
// campaña de 2026, el 8 de abril según la AEAT).
const RENTA_OPENS_MD = '04-08'

/**
 * Próximo plazo fiscal desde `today` (YYYY-MM-DD) con su apertura, estado y
 * progreso (#249): la renta del año anterior (abril–30 de junio) o, si hay
 * obligación, el Modelo 721 de un año (1 de enero–31 de marzo del siguiente).
 * Entre enero y marzo vence el 721 del año anterior, así que se necesita la
 * obligación de ambos años. Son las fechas habituales; el calendario oficial
 * lo publica la AEAT cada año.
 */
export function nextFiscalDeadline(today: string, obliged721: { previous: boolean; current: boolean }): Deadline {
  const y = Number(today.slice(0, 4))
  const renta = (year: number) => ({ label: `Renta ${year}`, opens: `${year + 1}-${RENTA_OPENS_MD}`, opensApprox: true, date: `${year + 1}-06-30` })
  const modelo721 = (year: number) => ({ label: `Modelo 721 de ${year}`, opens: `${year + 1}-01-01`, opensApprox: false, date: `${year + 1}-03-31` })
  const candidates = [
    ...(obliged721.previous ? [modelo721(y - 1)] : []),
    renta(y - 1),
    ...(obliged721.current ? [modelo721(y)] : []),
    renta(y),
  ]
  const next = candidates.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  const open = today >= next.opens
  const length = daysUntil(next.opens, next.date)
  return {
    ...next,
    days: daysUntil(today, next.date),
    status: open ? 'open' : 'pending',
    daysToOpen: open ? 0 : daysUntil(today, next.opens),
    progress: open && length > 0 ? Math.min(100, (daysUntil(next.opens, today) / length) * 100) : 0,
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
