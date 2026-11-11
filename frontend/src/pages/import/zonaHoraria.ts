import { formatNumber } from '../../utils/format'

// Zona horaria de un CSV de Binance (#599): su columna «Time» no la indica. El
// backend la deduce comparando las órdenes con el mercado; aquí se muestra y se
// elige. Desfase en horas respecto de UTC (UTC+2 = 2).

export type Confianza = 'alta' | 'baja' | 'sin_datos'

export interface DeteccionZona {
  desfaseHoras: number | null
  coincidencias: number
  muestras: number
  confianza: Confianza
}

export const DESFASE_MIN = -12
export const DESFASE_MAX = 14

/** «UTC», «UTC+2», «UTC-5». */
export function etiquetaDesfase(d: number): string {
  return d === 0 ? 'UTC' : `UTC${d > 0 ? '+' : '-'}${Math.abs(d)}`
}

export const OPCIONES_DESFASE = Array.from({ length: DESFASE_MAX - DESFASE_MIN + 1 }, (_, i) => {
  const d = DESFASE_MIN + i
  return { value: d, label: etiquetaDesfase(d) }
})

/** Qué dice la detección, en una frase. */
export function textoDeteccion(det: DeteccionZona | undefined, comprobando: boolean): string {
  if (comprobando) return 'Comprobando la zona horaria con el precio de mercado…'
  if (!det) return 'Sin comprobar.'
  const n = (v: number) => formatNumber(v, 0)
  if (det.confianza === 'sin_datos' || det.desfaseHoras === null) {
    return 'No se pudo comprobar (sin conexión o sin órdenes comparables): elige la zona en que exportaste el archivo.'
  }
  const coinciden = `${n(det.coincidencias)} de ${n(det.muestras)} órdenes coinciden con el mercado`
  return det.confianza === 'alta'
    ? `Detectada ${etiquetaDesfase(det.desfaseHoras)}: ${coinciden}.`
    : `Posible ${etiquetaDesfase(det.desfaseHoras)}, sin certeza (${coinciden}): revísala.`
}

/** Desfase que se aplica de oficio tras detectar: solo con confianza alta. */
export function desfaseDetectado(det: DeteccionZona | undefined): number | null {
  return det && det.confianza === 'alta' ? det.desfaseHoras : null
}

/** Qué cambia al pasar una importación a otra zona (#599). `horas`: nuevo desfase menos el actual. */
export function textoImpacto(i: { desplazadas: number; respetadas: number; cambianDia: number; cambianAnio: number }, horas: number): string {
  const n = (v: number) => formatNumber(v, 0)
  const partes = [
    `Se desplazarán ${n(i.desplazadas)} transacciones ${n(Math.abs(horas))} ${Math.abs(horas) === 1 ? 'hora' : 'horas'} ${horas > 0 ? 'antes' : 'después'}`,
    `${n(i.cambianDia)} cambian de día y ${n(i.cambianAnio)} de año`,
  ]
  const respetadas = i.respetadas === 1 ? ' La que tiene la hora editada a mano no se toca.'
    : i.respetadas > 1 ? ` Las ${n(i.respetadas)} con la hora editada a mano no se tocan.` : ''
  return `${partes.join('; ')}.${respetadas}`
}
