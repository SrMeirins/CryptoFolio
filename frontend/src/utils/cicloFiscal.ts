import type { FiscalHito } from '../api/portfolio'
import { MONTHS, formatFiscalDate } from './fiscalTable'

// Línea del ciclo fiscal (#538): lógica pura de las teselas de meses, las
// franjas de cada plazo, el anillo del próximo y la urgencia en texto.
// Fechas AAAA-MM-DD en la zona de la app, tal como llegan del backend.

export interface MesCiclo {
  /** AAAA-MM */
  clave: string
  etiqueta: string
  anio: number
  /** Primer mes de un año en la ventana (o el primero de la ventana): se rotula el año. */
  rotulaAnio: boolean
}

/** Los meses de la ventana, en orden. */
export function mesesCiclo(ventana: { desde: string; hasta: string }): MesCiclo[] {
  const [y0, m0] = ventana.desde.split('-').map(Number)
  const [y1, m1] = ventana.hasta.split('-').map(Number)
  const total = (y1 - y0) * 12 + (m1 - m0) + 1
  return Array.from({ length: total }, (_, i) => {
    const idx = m0 - 1 + i
    const anio = y0 + Math.floor(idx / 12)
    const mes = idx % 12
    return { clave: `${anio}-${String(mes + 1).padStart(2, '0')}`, etiqueta: MONTHS[mes], anio, rotulaAnio: i === 0 || mes === 0 }
  })
}

/** Columnas que ocupa la franja de un plazo: primera (0-based) y número de meses, recortado a la ventana. */
export function franjaPlazo(h: Pick<FiscalHito, 'desde' | 'hasta'>, meses: readonly MesCiclo[]): { inicio: number; meses: number } | null {
  const desde = h.desde.slice(0, 7), hasta = h.hasta.slice(0, 7)
  const i = meses.findIndex(m => m.clave >= desde)
  if (i === -1 || meses[i].clave > hasta) return null
  let j = i
  while (j + 1 < meses.length && meses[j + 1].clave <= hasta) j++
  return { inicio: i, meses: j - i + 1 }
}

/** Plazos que tocan un mes (AAAA-MM). */
export function plazosDelMes(ciclo: readonly FiscalHito[], clave: string): FiscalHito[] {
  return ciclo.filter(h => h.desde.slice(0, 7) <= clave && h.hasta.slice(0, 7) >= clave)
}

export type NivelUrgencia = 'urgente' | 'pronto' | 'normal' | 'cerrado'

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/**
 * Urgencia de un plazo, siempre con texto además del color: abierto, quedan
 * N días (urgente a 7 o menos, pronto a 30 o menos); sin abrir, cuándo abre.
 */
export function urgencia(h: FiscalHito): { nivel: NivelUrgencia; etiqueta: string | null; texto: string } {
  if (h.estado === 'pasado') return { nivel: 'cerrado', etiqueta: null, texto: `Cerrado el ${formatFiscalDate(h.hasta)}` }
  if (h.estado === 'proximo') {
    return { nivel: 'normal', etiqueta: null, texto: h.inicioAproximado ? `Abre hacia el ${formatFiscalDate(h.desde)}` : `Abre en ${dias(h.diasParaAbrir)}` }
  }
  const texto = h.diasRestantes === 0 ? 'Hoy es el último día' : `${h.diasRestantes === 1 ? 'Queda' : 'Quedan'} ${dias(h.diasRestantes)}`
  if (h.diasRestantes <= 7) return { nivel: 'urgente', etiqueta: 'Urgente', texto }
  if (h.diasRestantes <= 30) return { nivel: 'pronto', etiqueta: 'Pronto', texto }
  return { nivel: 'normal', etiqueta: null, texto }
}

/** Anillo del próximo plazo: el número de días, qué cuenta y el arco (0-100). */
export function anilloPlazo(h: FiscalHito): { numero: number; unidad: string; pct: number } {
  if (h.estado === 'proximo') return { numero: h.diasParaAbrir, unidad: h.diasParaAbrir === 1 ? 'día para abrir' : 'días para abrir', pct: 0 }
  return { numero: Math.max(0, h.diasRestantes), unidad: h.diasRestantes === 1 ? 'día' : 'días', pct: Math.min(100, Math.max(0, h.progreso)) }
}
