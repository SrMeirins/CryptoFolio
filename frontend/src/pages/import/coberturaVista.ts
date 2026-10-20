import type { CambioEncaje, CoberturaExchange, HuecoCobertura } from './types'
import { formatFiscalDate } from '../../utils/fiscalTable'

// Cobertura temporal (#328): geometría de la barra, marcas de año, intensidad
// mensual y textos. Lógica pura (fechas «YYYY-MM-DD» en UTC).

const DIA = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
/** Anchura mínima visible de un tramo (%), para que un hueco corto no desaparezca. */
const MIN_ANCHO = 0.6

export interface Segmento { left: number; width: number }

/** Posición de [desde, hasta] dentro de [inicio, fin] en porcentaje (fin incluido). */
export function segmento(desde: string, hasta: string, inicio: string, fin: string): Segmento {
  const total = ms(fin) - ms(inicio) + DIA
  const left = Math.max(0, ((ms(desde) - ms(inicio)) / total) * 100)
  const width = Math.max(MIN_ANCHO, ((ms(hasta) - ms(desde) + DIA) / total) * 100)
  return { left: Math.min(left, 100 - MIN_ANCHO), width: Math.min(width, 100 - left) }
}

/** Fin de la escala: hoy si hay pendiente, si no la última transacción. */
export const finEscala = (c: CoberturaExchange) => c.pendiente?.hasta ?? c.hasta

/** Una marca por cada 1 de enero dentro de la escala. */
export function marcasAnio(inicio: string, fin: string): { anio: number; left: number }[] {
  const out: { anio: number; left: number }[] = []
  for (let a = Number(inicio.slice(0, 4)) + 1; a <= Number(fin.slice(0, 4)); a++) {
    out.push({ anio: a, left: segmento(`${a}-01-01`, `${a}-01-01`, inicio, fin).left })
  }
  return out
}

/** Todos los meses de la escala con su número de transacciones y un nivel 0–4 relativo al máximo. */
export function nivelesMeses(meses: readonly { mes: string; n: number }[], inicio: string, fin: string): { mes: string; n: number; nivel: number }[] {
  const porMes = new Map(meses.map(m => [m.mes, m.n]))
  const max = Math.max(1, ...meses.map(m => m.n))
  const out: { mes: string; n: number; nivel: number }[] = []
  let [y, m] = [Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7))]
  const [yf, mf] = [Number(fin.slice(0, 4)), Number(fin.slice(5, 7))]
  while (y < yf || (y === yf && m <= mf)) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    const n = porMes.get(mes) ?? 0
    out.push({ mes, n, nivel: n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4)) })
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

const f = formatFiscalDate
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** «del 17 jun 2026 al 20 oct 2026» para exportar ese tramo. */
export function rangoExportar(h: HuecoCobertura): string {
  return `del ${f(h.desde)} al ${f(h.hasta)}`
}

/** «17/06/2026 – 20/10/2026», para pegar en el selector de fechas del exchange. */
export function fechasParaCopiar(h: HuecoCobertura): string {
  const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
  return `${dmy(h.desde)} – ${dmy(h.hasta)}`
}

const NOMBRE = { binance: 'Binance', bitvavo: 'Bitvavo' } as const

/** Cambio de cobertura de un lote, en lenguaje claro. */
export function textoEncaje(c: CambioEncaje): string {
  const ex = NOMBRE[c.exchange]
  switch (c.tipo) {
    case 'rellena': return `Rellena el hueco de ${ex} del ${f(c.desde)} al ${f(c.hasta)} (${dias(c.dias)}).`
    case 'rellena_parte': return `Rellena en parte el hueco de ${ex} del ${f(c.desde)} al ${f(c.hasta)}; queda algún tramo sin datos.`
    case 'deja_hueco': return `Deja un hueco de ${dias(c.dias)} en ${ex} del ${f(c.desde)} al ${f(c.hasta)}: si operaste entonces, exporta ese tramo.`
    case 'al_dia': return `Pone ${ex} al día hasta el ${f(c.hasta)}.`
    case 'avanza': return `Avanza ${ex}; aún faltan ${dias(c.dias)} desde el ${f(c.desde)} hasta hoy.`
  }
}
