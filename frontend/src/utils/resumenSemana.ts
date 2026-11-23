import type { FiscalHito, Notification } from '../api/portfolio'
import { formatFiscalDate } from './fiscalTable'

// Resumen de los últimos 7 días del Dashboard (#522): hoy y los 6 anteriores,
// como el «7 d» de P&L diario. Funciones puras: cambio del valor, aporte por
// activo (suma del detalle de cada día), avisos pendientes y plazos fiscales
// cercanos, cada uno con su enlace.

export const DIAS_RESUMEN = 7
export const VENTANA_PLAZOS = 30

const round2 = (n: number) => Math.round(n * 100) / 100

/** Primer día del periodo: hoy menos 6 (fechas ISO, sin zona). */
export function inicioSemana(hoy: string): string {
  const t = Date.parse(`${hoy}T00:00:00Z`) - (DIAS_RESUMEN - 1) * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Días del periodo en orden, de inicio a hoy. */
export function diasSemana(hoy: string): string[] {
  const inicio = Date.parse(`${inicioSemana(hoy)}T00:00:00Z`)
  return Array.from({ length: DIAS_RESUMEN }, (_, i) => new Date(inicio + i * 86_400_000).toISOString().slice(0, 10))
}

interface DiaValor { date: string; value: number; capitalIn: number; capitalOut: number }

/**
 * Cambio del valor de la cartera: el de ahora (en vivo si lo hay) frente al
 * cierre del día anterior al periodo, y los flujos netos de capital propio del
 * periodo. Sin cierre previo (cartera más nueva), desde cero.
 */
export function cambioValor(dias: readonly DiaValor[], hoy: string, valorAhora: number | null): { cambio: number; flujos: number } | null {
  const inicio = inicioSemana(hoy)
  const previos = dias.filter(d => d.date < inicio)
  const base = previos.length ? previos[previos.length - 1].value : 0
  const enPeriodo = dias.filter(d => d.date >= inicio && d.date <= hoy)
  const ultimo = enPeriodo.length ? enPeriodo[enPeriodo.length - 1].value : null
  const ahora = valorAhora ?? ultimo
  if (ahora === null) return null
  const flujos = round2(enPeriodo.reduce((s, d) => s + d.capitalIn - d.capitalOut, 0))
  return { cambio: round2(ahora - base), flujos }
}

export interface AporteActivo { asset: string; pnl: number }

/**
 * Aporte de cada activo al P&L del periodo: suma de su aporte de cada día
 * (detalle del día del calendario). Mejor, el de mayor aporte positivo; peor,
 * el de menor negativo. Faltando algún día, null (no se compara a medias).
 */
export function mejorYPeor(detalles: ReadonlyArray<{ contributions: readonly AporteActivo[] } | undefined>): { mejor: AporteActivo | null; peor: AporteActivo | null } | null {
  if (detalles.some(d => !d)) return null
  const suma = new Map<string, number>()
  for (const d of detalles) for (const c of d!.contributions) suma.set(c.asset, (suma.get(c.asset) ?? 0) + c.pnl)
  const lista = [...suma].map(([asset, pnl]) => ({ asset, pnl: round2(pnl) }))
  const mejor = lista.filter(a => a.pnl > 0).sort((a, b) => b.pnl - a.pnl)[0] ?? null
  const peor = lista.filter(a => a.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0] ?? null
  return { mejor, peor }
}

/** Avisos pendientes en la campana (ya sin silenciados ni descartados), por gravedad. */
export function resumenAvisos(avisos: readonly Notification[]): { total: number; errores: number; advertencias: number; categorias: string[] } {
  return {
    total: avisos.length,
    errores: avisos.filter(a => a.type === 'error').length,
    advertencias: avisos.filter(a => a.type === 'warning').length,
    categorias: [...new Set(avisos.map(a => a.category))],
  }
}

export interface PlazoCercano {
  id: FiscalHito['id']; ejercicio: number; titulo: string; texto: string; enlace: string; urgente: boolean
  /** Abierto: días que quedan; próximo: días para que abra. */
  abierto: boolean; dias: number
  /** Avance del plazo abierto, de 0 a 1. */
  progreso: number
}

const plural = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** Enlace de Fiscal de cada plazo. */
export function enlacePlazo(h: Pick<FiscalHito, 'id' | 'ejercicio'>): string {
  if (h.id === 'modelo721') return `/fiscal?anio=${h.ejercicio}&vista=modelo721`
  if (h.id === 'cierre') return '/fiscal?vista=planificar'
  return `/fiscal?anio=${h.ejercicio}`
}

/**
 * Plazos abiertos (con los días que quedan) y los que abren en los próximos
 * `ventana` días, sin los ya presentados, en orden de fin. El cierre del
 * ejercicio, abierto todo el año, solo cuando le quedan `ventana` días o menos.
 * Urgente: abierto y con 15 días o menos.
 */
export function plazosCercanos(ciclo: readonly FiscalHito[], ventana = VENTANA_PLAZOS): PlazoCercano[] {
  return ciclo
    .filter(h => !h.presentado && (
      // El cierre del ejercicio está «en curso» todo el año: solo cuenta en su último tramo.
      h.estado === 'en-curso' ? (h.id !== 'cierre' || h.diasRestantes <= ventana)
        : h.estado === 'proximo' && h.diasParaAbrir <= ventana))
    .sort((a, b) => a.hasta.localeCompare(b.hasta))
    .map(h => ({
      id: h.id,
      ejercicio: h.ejercicio,
      titulo: h.titulo,
      abierto: h.estado === 'en-curso',
      dias: h.estado === 'en-curso' ? h.diasRestantes : h.diasParaAbrir,
      progreso: Math.min(1, Math.max(0, h.progreso)),
      enlace: enlacePlazo(h),
      urgente: h.estado === 'en-curso' && h.diasRestantes <= 15,
      texto: h.estado === 'en-curso'
        ? (h.diasRestantes === 0 ? `${h.titulo}: hoy es el último día` : `${h.titulo}: quedan ${plural(h.diasRestantes)}`)
        : `${h.titulo}: abre ${h.inicioAproximado ? 'hacia' : 'el'} ${formatFiscalDate(h.desde)}`,
    }))
}

/** Enlace del Historial con las operaciones del periodo. */
export function enlaceOperaciones(hoy: string): string {
  return `/history?desde=${inicioSemana(hoy)}&hasta=${hoy}`
}

const LETRAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export interface BarraDia { date: string; pnl: number; live: boolean; letra: string; nombre: string; hoy: boolean }

/** Una barra por día del periodo (sin dato, 0), con su inicial y si es hoy. */
export function barrasSemana(hoy: string, dias: ReadonlyArray<{ date: string; pnl: number; live: boolean }>): BarraDia[] {
  const porFecha = new Map(dias.map(d => [d.date, d]))
  return diasSemana(hoy).map(date => {
    const d = porFecha.get(date)
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    return { date, pnl: d?.pnl ?? 0, live: d?.live ?? false, letra: LETRAS[dow], nombre: NOMBRES[dow], hoy: date === hoy }
  })
}

/** Operaciones de cada día del periodo a partir de los grupos diarios del Historial. */
export function opsPorDia(hoy: string, buckets: ReadonlyArray<{ periodo: string; ops: Record<string, number> }>): number[] {
  const porDia = new Map(buckets.map(b => [b.periodo.slice(0, 10), Object.values(b.ops).reduce((s, n) => s + n, 0)]))
  return diasSemana(hoy).map(d => porDia.get(d) ?? 0)
}
