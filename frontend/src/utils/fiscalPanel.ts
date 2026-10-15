import { calcularTramos, type Tramo } from './tramosIrpf'

// Panel fiscal del Dashboard (#236). Funciones puras.

export interface Deadline { label: string; date: string; days: number }

const DAY_MS = 86_400_000
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/**
 * Próxima fecha fiscal relevante desde `today` (YYYY-MM-DD): el fin del plazo
 * de la declaración de la renta del año anterior (30 de junio) o, si este año
 * hay obligación, el del Modelo 721 (31 de marzo del año siguiente). Son las
 * fechas habituales; el calendario oficial lo publica la AEAT cada año.
 */
export function nextFiscalDeadline(today: string, obliged721: boolean): Deadline {
  const y = Number(today.slice(0, 4))
  const candidates: Array<{ label: string; date: string }> = [
    { label: `Renta ${y - 1}`, date: `${y}-06-30` },
    ...(obliged721 ? [{ label: `Modelo 721 de ${y}`, date: `${y + 1}-03-31` }] : []),
    { label: `Renta ${y}`, date: `${y + 1}-06-30` },
  ]
  const next = candidates.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  return { ...next, days: daysUntil(today, next.date) }
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
