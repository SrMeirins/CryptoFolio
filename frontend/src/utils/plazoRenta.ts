import type { FiscalHito } from '../api/portfolio'
import { formatFiscalDate } from './fiscalTable'

// Plazo de la Renta de un ejercicio cerrado (#537), con las fechas y el estado
// que calcula el backend para el calendario fiscal. Sin hito (ejercicios más
// antiguos que el anterior) o con el plazo ya pasado, el plazo está cerrado.

const plural = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

export function textoPlazoRenta(h: FiscalHito | undefined): string {
  if (!h || h.estado === 'pasado') return 'Plazo de la Renta cerrado'
  if (h.estado === 'proximo') return `La Renta ${h.inicioAproximado ? 'abre hacia' : 'abre el'} ${formatFiscalDate(h.desde)}`
  return h.diasRestantes === 0
    ? 'Renta: hoy es el último día'
    : `Renta: ${plural(h.diasRestantes)} para el ${formatFiscalDate(h.hasta)}`
}
