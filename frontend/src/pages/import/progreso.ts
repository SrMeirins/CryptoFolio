import type { ProgressEvent } from './types'

// Estado de la pantalla de importación en curso (#324). Lógica pura: se deriva del log de eventos.

export type FaseClave = 'importing' | 'prices' | 'fifo'
export const FASES: readonly { key: FaseClave; label: string }[] = [
  { key: 'importing', label: 'Importar' },
  { key: 'prices', label: 'Precios' },
  { key: 'fifo', label: 'FIFO' },
]

// Peso de cada fase en la barra global: el FIFO y los precios dominan en historiales grandes.
const TRAMO: Record<FaseClave, [number, number]> = { importing: [0, 30], prices: [30, 70], fifo: [70, 100] }

const TITULO: Record<FaseClave, string> = {
  importing: 'Guardando las transacciones',
  prices: 'Buscando precios históricos',
  fifo: 'Calculando ganancias y pérdidas (FIFO)',
}

export interface EstadoProgreso {
  fase: FaseClave | 'done' | 'error'
  titulo: string
  /** «12 de 42», si la fase informa de su avance. */
  detalle: string | null
  porcentaje: number
  /** Segundos que faltan de una espera por rate limit; null si no hay espera en curso. */
  espera: number | null
  fases: { key: FaseClave; label: string; estado: 'hecha' | 'actual' | 'pendiente' | 'error' }[]
}

const fmt = new Intl.NumberFormat('es-ES')

export function estadoProgreso(log: readonly ProgressEvent[], ahora: number): EstadoProgreso {
  const ultimo = log.at(-1)
  const error = log.some(e => e.phase === 'error')
  const terminado = !error && ultimo?.phase === 'done'
  const faseActual: FaseClave = ([...log].reverse().find(e => e.phase !== 'done' && e.phase !== 'error')?.phase as FaseClave | undefined) ?? 'importing'
  const idx = FASES.findIndex(f => f.key === faseActual)

  const avance = [...log].reverse().find(e => e.phase === faseActual && e.total && e.total > 0 && e.progress !== undefined)
  const fraccion = avance ? Math.min(1, (avance.progress as number) / (avance.total as number)) : 0
  const [desde, hasta] = TRAMO[faseActual]
  const porcentaje = terminado ? 100 : Math.round(desde + (hasta - desde) * fraccion)

  // Espera en curso: el último evento de precios anunció una espera y no ha llegado nada después.
  let espera: number | null = null
  if (ultimo?.espera && ultimo.t !== undefined && !terminado && !error) {
    espera = Math.max(0, Math.ceil(ultimo.espera - (ahora - ultimo.t) / 1000))
  }

  const fases = FASES.map((f, i) => ({
    ...f,
    estado: terminado || i < idx ? 'hecha' as const : i === idx ? (error ? 'error' as const : 'actual' as const) : 'pendiente' as const,
  }))

  return {
    fase: error ? 'error' : terminado ? 'done' : faseActual,
    titulo: error ? 'La importación se ha detenido' : terminado ? 'Importación completada'
      : espera !== null ? 'CoinGecko pide una pausa' : TITULO[faseActual],
    detalle: !terminado && !error && avance ? `${fmt.format(avance.progress as number)} de ${fmt.format(avance.total as number)}` : null,
    porcentaje,
    espera,
    fases,
  }
}

/** «8 s», «1 min 05 s». */
export function formatoDuracion(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

/** Título de la pestaña mientras importa y al terminar. */
export function tituloPestana(estado: EstadoProgreso): string {
  if (estado.fase === 'done') return '✓ Importación lista'
  if (estado.fase === 'error') return '⚠ Error en la importación'
  return `${estado.porcentaje} % · Importando`
}

/** Eventos del log técnico: sin los de solo avance. */
export function eventosLog(log: readonly ProgressEvent[]): ProgressEvent[] {
  return log.filter(e => !e.soloProgreso)
}
