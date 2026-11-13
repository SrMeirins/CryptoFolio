import type { Grupo721, Modelo721, Veredicto721 } from '../pages/fiscal/types'
import { sanitizeCsvField } from './csvSafety'
import { formatEur } from './format'

// Modelo 721 por entidad custodia (#545): veredicto en palabras, escala de la
// barra, autocustodia, CSV y valoración en vivo del año en curso. Funciones puras.

/** Diferencia hasta el umbral: positiva si aún no se supera. */
export function margenUmbral(data: Pick<Modelo721, 'totalValorCustodia' | 'umbral'>): number {
  return data.umbral - data.totalValorCustodia
}

/** Valor fuera de los exchanges (autocustodia): no computa. */
export function autocustodiaEur(data: Pick<Modelo721, 'totalValor' | 'grupos'>): number {
  return Math.max(0, data.totalValor - data.grupos.reduce((s, g) => s + g.totalEur, 0))
}

export type TonoVeredicto = 'obligado' | 'libre' | 'dudoso'

/** Veredicto en palabras: título, motivo y tono. */
export function textoVeredicto(v: Veredicto721, presentado: boolean): { titulo: string; motivo: string; tono: TonoVeredicto } {
  const eur = formatEur
  if (v.obligado === true) {
    const titulo = presentado ? 'Lo tenías que presentar y ya está presentado' : 'Tienes que presentarlo'
    const motivo = v.motivo === 'extincion'
      ? `Dejaste de tener monedas que habías declarado (${v.extinguidas.map(e => `${e.asset} en ${e.entidad}`).join(', ')}): su extinción se declara en todo caso.`
      : v.motivo === 'incremento'
        ? `El valor (${eur(v.valorEur)}) supera en más de 20.000 € el del último 721 presentado.`
        : `El valor en custodia en el extranjero (${eur(v.valorEur)}) supera el umbral de ${eur(v.umbral)}.`
    return { titulo, motivo, tono: 'obligado' }
  }
  if (v.obligado === null) {
    return { titulo: 'Aún no se puede saber', motivo: 'Faltan precios de algún activo: el valor es un mínimo y todavía no supera el umbral.', tono: 'dudoso' }
  }
  const motivo = v.motivo === 'incremento_insuficiente' && v.objetivoIncremento !== null
    ? `Supera el umbral, pero ya lo presentaste: solo obliga de nuevo por encima de ${eur(v.objetivoIncremento)}.`
    : `El valor en custodia en el extranjero (${eur(v.valorEur)}) no supera el umbral de ${eur(v.umbral)}.`
  return { titulo: 'No tienes que presentarlo', motivo, tono: 'libre' }
}

/** Escala común de la barra: valor, umbral y, si lo hay, el objetivo del incremento, con margen. */
export function escalaBarra(v: Pick<Veredicto721, 'valorEur' | 'umbral' | 'objetivoIncremento'>): { max: number; pct: (x: number) => number } {
  const max = Math.max(v.umbral, v.objetivoIncremento ?? 0, v.valorEur) * 1.1
  return { max, pct: x => (max > 0 ? Math.min(100, Math.max(0, (x / max) * 100)) : 0) }
}

/**
 * Escala del histórico con divisiones redondas (1, 2, 2,5 o 5 por potencia de
 * 10) que cubre el mayor valor y el umbral, con 3 a 5 tramos.
 */
export function escalaRedonda(max: number, umbral: number): { top: number; ticks: number[] } {
  const alto = Math.max(max, umbral, 1)
  const bruto = alto / 3
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map(f => f * pot).find(p => Math.ceil(alto / p) <= 4) ?? 10 * pot
  const top = Math.ceil(alto / paso) * paso
  return { top, ticks: Array.from({ length: Math.round(top / paso) + 1 }, (_, i) => i * paso) }
}

/** El margen en una frase: lo que falta para el umbral (o para volver a obligar) o cuánto se supera. */
export function textoMargen(v: Pick<Veredicto721, 'valorEur' | 'umbral' | 'objetivoIncremento'>): string {
  if (v.valorEur <= v.umbral) return `Te faltan ${formatEur(v.umbral - v.valorEur)} para el umbral`
  if (v.objetivoIncremento !== null && v.valorEur <= v.objetivoIncremento) {
    return `Te faltan ${formatEur(v.objetivoIncremento - v.valorEur)} para volver a estar obligado`
  }
  return `Superas el umbral en ${formatEur(v.valorEur - v.umbral)}`
}

/** Reparto del valor que computa por entidad (o wallet sin entidad), de mayor a menor. */
export function repartoEntidades(grupos: readonly Grupo721[]): { clave: string; nombre: string; valorEur: number; pct: number }[] {
  const computan = grupos.filter(g => g.computa && g.totalEur > 0)
  const total = computan.reduce((s, g) => s + g.totalEur, 0)
  return computan
    .map(g => ({ clave: g.clave, nombre: g.entidad?.nombre ?? g.wallets.map(w => w.nombre).join(', '), valorEur: g.totalEur, pct: total > 0 ? (g.totalEur / total) * 100 : 0 }))
    .sort((x, y) => y.valorEur - x.valorEur)
}

const num = (n: number, d: number) => (Number.isFinite(n) ? n.toFixed(d) : '')

/** CSV por entidad y activo, para preparar el modelo (separador «;», textos saneados). */
export function buildModelo721Csv(data: Pick<Modelo721, 'fecha' | 'grupos'>): string {
  const header = ['Fecha de valoración', 'Entidad', 'NIF', 'País', 'Web', 'Wallets', 'Activo', 'Unidades', 'Valor (EUR)', 'Computa', 'Sin precio'].join(';')
  const lines = data.grupos.flatMap(g => g.activos.map(a => [
    data.fecha, sanitizeCsvField(g.entidad?.nombre ?? 'Sin entidad asignada'), sanitizeCsvField(g.entidad?.nif ?? ''),
    g.entidad?.pais ?? '', sanitizeCsvField(g.entidad?.web ?? ''), sanitizeCsvField(g.wallets.map(w => w.nombre).join(', ')),
    sanitizeCsvField(a.asset), num(a.unidades, 12).replace(/\.?0+$/, ''), num(a.valorEur, 2), g.computa ? 'sí' : 'no', a.sinPrecio ? 'sí' : '',
  ].join(';')))
  return [header, ...lines].join('\n')
}

/**
 * Año en curso con precios en vivo (#303): cada posición se recalcula con el
 * precio del feed y el veredicto se rehace con el umbral y el incremento; la
 * extinción viene del servidor. Los años cerrados no se tocan.
 */
export function liveModelo721(data: Modelo721, pricesEur: Readonly<Record<string, number>>): Modelo721 {
  if (!data.esAnioEnCurso) return data
  let changed = false
  const grupos: Grupo721[] = data.grupos.map(g => {
    const activos = g.activos.map(a => {
      const p = pricesEur[a.asset]
      if (!(p && p > 0)) return a
      changed = true
      return { ...a, valorEur: a.unidades * p, sinPrecio: false }
    })
    return { ...g, activos, totalEur: activos.reduce((s, a) => s + a.valorEur, 0) }
  })
  if (!changed) return data
  const antes = data.grupos.reduce((s, g) => s + g.totalEur, 0)
  const ahora = grupos.reduce((s, g) => s + g.totalEur, 0)
  const valorEur = grupos.filter(g => g.computa).reduce((s, g) => s + g.totalEur, 0)
  const preciosPendientes = [...new Set(grupos.flatMap(g => g.activos.filter(a => a.sinPrecio).map(a => a.asset)))]
  const v = data.veredicto
  const supera = valorEur > v.umbral && (v.objetivoIncremento === null || valorEur > v.objetivoIncremento)
  const obligado = v.extinguidas.length > 0 || supera ? true : preciosPendientes.length > 0 ? null : false
  const motivo = v.extinguidas.length > 0 ? 'extincion'
    : supera ? (v.objetivoIncremento === null ? 'umbral' : 'incremento')
      : valorEur > v.umbral ? 'incremento_insuficiente' : 'no_supera'
  return {
    ...data, grupos, totalValor: data.totalValor - antes + ahora, totalValorCustodia: valorEur,
    superaUmbral: valorEur > v.umbral, preciosPendientes, incompleto: preciosPendientes.length > 0,
    veredicto: { ...v, valorEur, obligado, motivo }, obligado: obligado === true,
  }
}
