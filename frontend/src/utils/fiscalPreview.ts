import { cuotaAhorro } from './fiscalHeader'
import type { Tramo } from './tramosIrpf'

// Vista previa de los ajustes fiscales (#451): qué pasaría con la cuota del
// ejercicio en curso y con la obligación del Modelo 721 antes de aplicar un
// cambio. Mismo cálculo que la página Fiscal (cuotaAhorro sobre la base ya
// compensada), así que la previsión coincide con lo que se verá después.

export interface CuotaPreview { antes: number; despues: number; diferencia: number }

/** Cuota con los tipos guardados y con los nuevos (mismo orden de tramos). */
export function previewCuota(base: number, tramos: readonly Tramo[], tiposNuevos: readonly number[]): CuotaPreview {
  const antes = cuotaAhorro(base, [...tramos]).cuota
  const despues = cuotaAhorro(base, tramos.map((t, i) => ({ ...t, tipo: tiposNuevos[i] ?? t.tipo }))).cuota
  return { antes, despues, diferencia: despues - antes }
}

export interface Preview721 { obligado: boolean; seguro: boolean }

/**
 * ¿Obliga el Modelo 721 con este umbral? Con precios pendientes el valor es un
 * mínimo: si ya supera el umbral, seguro; si no, el resultado no es seguro (#267).
 */
export function preview721(valor: number, umbral: number, valorIncompleto: boolean): Preview721 {
  const obligado = valor > umbral
  return { obligado, seguro: obligado || !valorIncompleto }
}
