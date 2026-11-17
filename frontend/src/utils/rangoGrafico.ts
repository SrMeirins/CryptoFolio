import { zonedFormat } from './zonedFormat'

// Rango común de los gráficos (#508): Evolución, P&L diario y el gráfico del
// detalle de activo usan los mismos nombres y el mismo significado. Las fechas
// son días AAAA-MM-DD en la zona horaria de la aplicación; la aritmética de
// días se hace sobre esas cadenas (en UTC), sin depender del cambio de hora.

export type RangoPreset = '24h' | '7d' | '30d' | '90d' | '6m' | '1a' | 'anio' | 'todo'

export type RangoValor =
  | { tipo: 'preset'; preset: RangoPreset }
  /** Personalizado; con `hastaHoy` el final es siempre el día de hoy. */
  | { tipo: 'rango'; from: string; to: string; hastaHoy: boolean }

export const RANGO_PRESETS: readonly { value: RangoPreset; label: string; title: string; frase: string }[] = [
  { value: '24h', label: '24 h', title: 'Últimas 24 horas', frase: 'Últimas 24 horas' },
  { value: '7d', label: '7 d', title: 'Últimos 7 días', frase: 'Últimos 7 días' },
  { value: '30d', label: '30 d', title: 'Últimos 30 días', frase: 'Últimos 30 días' },
  { value: '90d', label: '90 d', title: 'Últimos 90 días', frase: 'Últimos 90 días' },
  { value: '6m', label: '6 m', title: 'Últimos 6 meses', frase: 'Últimos 6 meses' },
  { value: '1a', label: '1 a', title: 'Último año', frase: 'Último año' },
  { value: 'anio', label: 'Este año', title: 'Desde el 1 de enero', frase: 'Este año' },
  { value: 'todo', label: 'Todo', title: 'Toda la historia', frase: 'Todo' },
]

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Día de hoy en la zona de la aplicación (AAAA-MM-DD). */
export function hoyApp(now: Date = new Date()): string {
  return zonedFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const dia = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(d: string, n: number): string {
  return dia(ms(d) + n * 86_400_000)
}

/** Resta meses de calendario; si el día no existe en ese mes, el último del mes. */
export function restarMeses(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  const total = y * 12 + (m - 1) - n
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return dia(Date.UTC(ny, nm, Math.min(day, ultimo)))
}

/** Días naturales incluidos entre dos fechas (ambas incluidas). */
export function diasEntre(from: string, to: string): number {
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1
}

export interface RangoResuelto {
  /** 24 h: serie intradía, sin días. */
  intradia: boolean
  /** Primer día incluido; undefined en «Todo» (desde la primera actividad). */
  from?: string
  to: string
}

/**
 * Días de un rango para pedir la serie. Los presets terminan hoy: «7 d» son
 * los últimos 7 días contando hoy; «6 m» y «1 a», desde el mismo día de hace
 * 6 meses o un año (el siguiente, para no contar ese día dos veces); «Este
 * año», desde el 1 de enero. Un personalizado se recorta a hoy.
 */
export function resolverRango(v: RangoValor, today: string): RangoResuelto {
  if (v.tipo === 'rango') {
    const to = v.hastaHoy || v.to > today ? today : v.to
    const from = v.from > to ? to : v.from
    return { intradia: false, from, to }
  }
  switch (v.preset) {
    case '24h': return { intradia: true, to: today }
    case '7d': return { intradia: false, from: sumarDias(today, -6), to: today }
    case '30d': return { intradia: false, from: sumarDias(today, -29), to: today }
    case '90d': return { intradia: false, from: sumarDias(today, -89), to: today }
    case '6m': return { intradia: false, from: sumarDias(restarMeses(today, 6), 1), to: today }
    case '1a': return { intradia: false, from: sumarDias(restarMeses(today, 12), 1), to: today }
    case 'anio': return { intradia: false, from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'todo': return { intradia: false, to: today }
  }
}

/** Año que se ve: el del final del rango. */
export function anioVisible(v: RangoValor, today: string): number {
  return Number(resolverRango(v, today).to.slice(0, 4))
}

/**
 * Salto al año anterior (-1) o siguiente (+1): el año natural completo; el
 * año en curso, hasta hoy (y sigue rodando). No pasa de `minYear` ni del año
 * actual; null si no hay a dónde ir.
 */
export function saltarAnio(v: RangoValor, today: string, dir: -1 | 1, minYear: number): RangoValor | null {
  const actual = Number(today.slice(0, 4))
  const destino = anioVisible(v, today) + dir
  if (destino < minYear || destino > actual) return null
  if (destino === actual) return { tipo: 'rango', from: `${destino}-01-01`, to: today, hastaHoy: true }
  return { tipo: 'rango', from: `${destino}-01-01`, to: `${destino}-12-31`, hastaHoy: false }
}

/**
 * «Ir a hoy»: la misma duración, terminando hoy. Un preset ya termina hoy y
 * no cambia; null si no hay nada que mover.
 */
export function irAHoy(v: RangoValor, today: string): RangoValor | null {
  if (v.tipo === 'preset' || v.hastaHoy) return null
  const r = resolverRango(v, today)
  if (r.to === today) return null
  const largo = diasEntre(r.from as string, r.to)
  return { tipo: 'rango', from: sumarDias(today, -(largo - 1)), to: today, hastaHoy: true }
}

// ── URL ──────────────────────────────────────────────────────────────────────

/** «30d», «2025-01-01_2025-12-31» o «2025-01-01_hoy». */
export function serializarRango(v: RangoValor): string {
  return v.tipo === 'preset' ? v.preset : `${v.from}_${v.hastaHoy ? 'hoy' : v.to}`
}

/** Lee el parámetro de la URL; null si falta, no es válido o el preset no está permitido. */
export function leerRango(raw: string | null, permitidos: readonly RangoPreset[], today: string): RangoValor | null {
  if (!raw) return null
  if ((permitidos as readonly string[]).includes(raw)) return { tipo: 'preset', preset: raw as RangoPreset }
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2}|hoy)$/)
  if (!m || !DIA.test(m[1]) || Number.isNaN(ms(m[1]))) return null
  const hastaHoy = m[2] === 'hoy'
  const to = hastaHoy ? today : m[2]
  if (Number.isNaN(ms(to)) || m[1] > to || m[1] > today) return null
  return { tipo: 'rango', from: m[1], to, hastaHoy }
}

// ── Textos ───────────────────────────────────────────────────────────────────

const sinPunto = (s: string) => s.replace('.', '')

/** «3 mar 2025» (la fecha ya es un día de la zona de la app: se formatea tal cual, en UTC). */
export function fechaCorta(d: string): string {
  return sinPunto(new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms(d))))
}

/** Texto del rango: «Últimos 30 días», «Del 1 ene 2025 al 31 dic 2025», «Desde el 1 ene 2025 hasta hoy». */
export function textoRango(v: RangoValor, today: string): string {
  if (v.tipo === 'preset') return RANGO_PRESETS.find(p => p.value === v.preset)?.frase ?? ''
  const r = resolverRango(v, today)
  const from = r.from as string
  if (v.hastaHoy) return `Desde el ${fechaCorta(from)} hasta hoy`
  if (from === r.to) return fechaCorta(from)
  return `Del ${fechaCorta(from)} al ${fechaCorta(r.to)}`
}
