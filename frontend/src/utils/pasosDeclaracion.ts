import type { Declaracion } from '../api/portfolio'
import { CAMPO_LABEL } from './declaraciones'

// Estado de la declaración de un ejercicio cerrado por pasos (#542): datos
// completos (lo calcula la app), revisado, Renta presentada y Modelo 721
// presentado. Un solo origen: las marcas de fiscal_declaraciones. Puras.

export type IdPaso = 'datos' | 'revision' | 'renta' | 'modelo721'
/** hecho; cambiado: hecho pero las cifras han cambiado después; pendiente; no-aplica: el 721 sin obligación. */
export type EstadoPaso = 'hecho' | 'cambiado' | 'pendiente' | 'no-aplica'

export interface Paso {
  id: IdPaso
  titulo: string
  estado: EstadoPaso
  /** Marca guardada (revisado, presentado), si la hay. */
  marca?: Declaracion
}

export interface DatosEjercicio {
  /** Operaciones con la clave de contrapartida por revisar. */
  porRevisar: number
  /** Activos sin precio a 31 de diciembre. */
  preciosPendientes: readonly string[]
}

const TITULO: Record<IdPaso, string> = {
  datos: 'Datos completos', revision: 'Revisado', renta: 'Renta presentada', modelo721: 'Modelo 721 presentado',
}

export function datosCompletos(d: DatosEjercicio): boolean {
  return d.porRevisar === 0 && d.preciosPendientes.length === 0
}

export function pasosEjercicio(ejercicio: number, declaraciones: readonly Declaracion[], datos: DatosEjercicio, obligado721: boolean | null): Paso[] {
  const marca = (tipo: Declaracion['tipo']) => declaraciones.find(d => d.ejercicio === ejercicio && d.tipo === tipo)
  const marcado = (tipo: Declaracion['tipo']): Paso => {
    const m = marca(tipo)
    const estado: EstadoPaso = !m ? 'pendiente' : (m.cambios?.length ?? 0) > 0 ? 'cambiado' : 'hecho'
    return { id: tipo, titulo: TITULO[tipo], estado, ...(m && { marca: m }) }
  }
  const m721 = marca('modelo721')
  return [
    { id: 'datos', titulo: TITULO.datos, estado: datosCompletos(datos) ? 'hecho' : 'pendiente' },
    marcado('revision'),
    marcado('renta'),
    // Sin obligación y sin marca, el 721 no aplica; si se marcó igualmente, cuenta como presentado.
    m721 ? { id: 'modelo721', titulo: TITULO.modelo721, estado: 'hecho', marca: m721 }
      : obligado721 === false
        ? { id: 'modelo721', titulo: 'Modelo 721: no obligatorio', estado: 'no-aplica' }
        : { id: 'modelo721', titulo: TITULO.modelo721, estado: 'pendiente' },
  ]
}

/** Pasos hechos de los que cuentan: lo que no aplica (el 721 sin obligación) queda fuera (#542). */
export function progresoPasos(pasos: readonly Paso[]): { hechos: number; total: number; completo: boolean } {
  const cuentan = pasos.filter(p => p.estado !== 'no-aplica')
  const hechos = cuentan.filter(p => p.estado === 'hecho' || p.estado === 'cambiado').length
  return { hechos, total: cuentan.length, completo: hechos === cuentan.length }
}

export interface FilaDiferencia { campo: string; concepto: string; declarado: number; actual: number; diferencia: number; cambia: boolean }

/**
 * Tabla declarado, actual y diferencia, por concepto (#542): todos los
 * conceptos guardados en la marca, con los que han cambiado destacados.
 */
export function tablaDiferencias(m: Pick<Declaracion, 'cifras' | 'cambios'>): FilaDiferencia[] {
  const cambios = new Map((m.cambios ?? []).map(c => [c.campo, c]))
  return Object.keys(CAMPO_LABEL).filter(campo => campo in m.cifras).map(campo => {
    const declarado = Number(m.cifras[campo])
    const c = cambios.get(campo)
    const actual = c ? c.actual : declarado
    return { campo, concepto: CAMPO_LABEL[campo], declarado, actual, diferencia: actual - declarado, cambia: !!c }
  })
}

/**
 * Estado de un ejercicio en una frase, para el Dashboard (#542). Mismo origen
 * que los pasos: las marcas de revisado y Renta presentada.
 */
export function resumenEstado(ejercicio: number, declaraciones: readonly Declaracion[]): { texto: string; tono: 'positive' | 'warning' | 'neutral' } {
  const renta = declaraciones.find(d => d.ejercicio === ejercicio && d.tipo === 'renta')
  const revision = declaraciones.find(d => d.ejercicio === ejercicio && d.tipo === 'revision')
  if (renta) return (renta.cambios?.length ?? 0) > 0
    ? { texto: 'Renta presentada; las cifras han cambiado', tono: 'warning' }
    : { texto: 'Renta presentada', tono: 'positive' }
  if (revision) return { texto: 'Revisado, falta presentar la Renta', tono: 'neutral' }
  return { texto: 'Pendiente de revisar y presentar', tono: 'warning' }
}
