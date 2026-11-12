import type { EstadoUnidades, RendimientoEvent } from '../pages/fiscal/types'
import { formatNumber } from './format'
import type { ChartColors } from './chartColors'

// Rendimientos de Fiscal (#544): tipo de cada uno, resumen por tipo,
// agrupado por mes, serie mensual del gráfico y estado de las unidades.
// Funciones puras.

export type ClaveTipo = 'staking' | 'intereses' | 'mineria' | 'airdrop' | 'cashback'

export interface MetaTipo {
  clave: ClaveTipo
  label: string
  /** Tratamiento que puede variar: se marca «Revisar» (#531). */
  revisar: boolean
}

/** Tipos en el orden en que se muestran. */
export const TIPOS: readonly MetaTipo[] = [
  { clave: 'staking', label: 'Staking', revisar: false },
  { clave: 'intereses', label: 'Intereses', revisar: false },
  { clave: 'mineria', label: 'Minería', revisar: false },
  { clave: 'airdrop', label: 'Airdrops', revisar: true },
  { clave: 'cashback', label: 'Cashback', revisar: true },
]

const POR_OPERACION: Record<string, ClaveTipo> = {
  STAKING_REWARD: 'staking',
  LENDING_INTEREST: 'intereses',
  LENDING_INTEREST_LOCKED: 'intereses',
  MINING_REWARD: 'mineria',
  AIRDROP: 'airdrop',
  CASHBACK: 'cashback',
}

/** Tipo de un rendimiento por su operación; sin ella (datos antiguos), por su etiqueta. */
export function claveDe(r: Pick<RendimientoEvent, 'operacion' | 'tipo'>): ClaveTipo {
  if (r.operacion && POR_OPERACION[r.operacion]) return POR_OPERACION[r.operacion]
  const t = r.tipo.toLowerCase()
  if (t.includes('staking')) return 'staking'
  if (t.includes('minería') || t.includes('mineria')) return 'mineria'
  if (t.includes('airdrop')) return 'airdrop'
  if (t.includes('cashback') || t.includes('bonus')) return 'cashback'
  return 'intereses'
}

export const metaDe = (clave: ClaveTipo): MetaTipo => TIPOS.find(t => t.clave === clave)!

export interface ResumenTipo { clave: ClaveTipo; label: string; total: number; n: number }

/** Total y número de rendimientos de cada tipo presente, en el orden de TIPOS. */
export function resumenPorTipo(rends: readonly RendimientoEvent[]): ResumenTipo[] {
  return TIPOS.flatMap(t => {
    const de = rends.filter(r => claveDe(r) === t.clave)
    return de.length === 0 ? [] : [{ clave: t.clave, label: t.label, total: de.reduce((s, r) => s + r.valorEur, 0), n: de.length }]
  })
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (mes: number) => MESES[mes - 1]

export interface GrupoMes { mes: number; label: string; items: RendimientoEvent[]; total: number }

/** Rendimientos agrupados por mes (por su fecha local), en orden y con subtotal. */
export function porMes(rends: readonly RendimientoEvent[]): GrupoMes[] {
  const grupos = new Map<number, RendimientoEvent[]>()
  for (const r of [...rends].sort((a, b) => (a.fechaHora ?? a.fecha).localeCompare(b.fechaHora ?? b.fecha))) {
    const mes = Number(r.fecha.slice(5, 7))
    grupos.set(mes, [...(grupos.get(mes) ?? []), r])
  }
  return [...grupos].sort((a, b) => a[0] - b[0]).map(([mes, items]) => ({
    mes, label: nombreMes(mes), items, total: items.reduce((s, r) => s + r.valorEur, 0),
  }))
}

export type FilaSerie = { mes: number; label: string } & Record<ClaveTipo, number>

/** Serie del gráfico: 12 meses con el valor de cada tipo. */
export function serieMensual(rends: readonly RendimientoEvent[]): FilaSerie[] {
  const filas: FilaSerie[] = MESES.map((label, i) => ({ mes: i + 1, label, staking: 0, intereses: 0, mineria: 0, airdrop: 0, cashback: 0 }))
  for (const r of rends) filas[Number(r.fecha.slice(5, 7)) - 1][claveDe(r)] += r.valorEur
  return filas
}

/** Meses distintos con algún rendimiento: el gráfico solo aporta con dos o más. */
export const mesesConDatos = (rends: readonly RendimientoEvent[]) => new Set(rends.map(r => r.fecha.slice(5, 7))).size

/** Por encima de este número de rendimientos, los meses empiezan plegados. */
export const PLEGAR_DESDE = 10

export type TonoEstado = 'conservadas' | 'parte' | 'fuera' | 'sin_lote'

/**
 * Cantidad que conservas. Sin el dato (respuesta de una versión anterior del
 * servidor), se deduce de lo transmitido; el estado y su detalle usan esta
 * misma cifra, nunca un valor vacío.
 */
export function conservadaDe(e: EstadoUnidades): number {
  if (Number.isFinite(e.conservada)) return e.conservada
  return Number.isFinite(e.transmitida) ? Math.max(0, e.cantidad - e.transmitida) : e.cantidad
}

/**
 * Estado de las unidades en corto, según lo que conservas (#544): lo que salió
 * puede haberse transmitido o haber salido sin efecto fiscal (margen).
 */
export function estadoCorto(e: EstadoUnidades | null | undefined): { texto: string; tono: TonoEstado } {
  if (!e || !(e.cantidad > 0)) return { texto: 'Cobrado en euros', tono: 'sin_lote' }
  const pct = Math.min(1, Math.max(0, conservadaDe(e) / e.cantidad))
  if (pct >= 1 - 1e-6) return { texto: 'Conservadas', tono: 'conservadas' }
  if (pct <= 1e-6) return { texto: 'Ya no las tienes', tono: 'fuera' }
  return { texto: `Conservas el ${formatNumber(Math.max(1, Math.min(99, Math.round(pct * 100))), 0)} %`, tono: 'parte' }
}

/** Color de cada tipo en el gráfico, de la paleta del tema. */
export function colorTipo(c: ChartColors, clave: ClaveTipo): string {
  return { staking: c.brand, intereses: c.info, mineria: c.purple, airdrop: c.warn, cashback: c.gain }[clave]
}
