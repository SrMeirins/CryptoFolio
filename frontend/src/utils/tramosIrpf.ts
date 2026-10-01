import type { CarryforwardDetalle } from '../pages/fiscal/types'

export interface Tramo { hasta: number; tipo: number; label: string }

// Tramos por defecto — base del ahorro, vigentes desde 2025 (Ley 7/2024).
// El último tramo subió del 28% al 30%. Verifica el tramo vigente cada año;
// puedes personalizarlo sin tocar código en Ajustes → Fiscal.
export const TRAMOS_DEFAULT: Tramo[] = [
  { hasta: 6_000,    tipo: 19, label: '0 – 6.000 €' },
  { hasta: 50_000,   tipo: 21, label: '6.001 – 50.000 €' },
  { hasta: 200_000,  tipo: 23, label: '50.001 – 200.000 €' },
  { hasta: 300_000,  tipo: 27, label: '200.001 – 300.000 €' },
  { hasta: Infinity, tipo: 30, label: '> 300.000 €' },
]

/** Parsea y valida el override de tipos guardado en config (Ajustes → Fiscal). */
export function parseTipos(stored: string): number[] | null {
  try {
    const arr = JSON.parse(stored)
    if (Array.isArray(arr) && arr.length === TRAMOS_DEFAULT.length && arr.every(n => typeof n === 'number' && n > 0 && n <= 100))
      return arr
  } catch { /* noop */ }
  return null
}

export interface TramoDesglose { tramo: string; tipo: number; cuota: number; base: number }

export function calcularTramos(base: number, tramos: Tramo[] = TRAMOS_DEFAULT): TramoDesglose[] {
  if (base <= 0) return []
  const result: TramoDesglose[] = []
  let restante = base
  let anterior = 0
  for (const t of tramos) {
    if (restante <= 0) break
    const tramo = Math.min(restante, t.hasta - anterior)
    if (tramo > 0) result.push({ tramo: t.label, tipo: t.tipo, cuota: tramo * (t.tipo / 100), base: tramo })
    restante -= tramo
    anterior = t.hasta === Infinity ? restante : t.hasta
  }
  return result
}

export function tramoActivo(base: number, tramos: Tramo[] = TRAMOS_DEFAULT): number {
  for (const t of tramos) {
    if (base <= t.hasta) return t.tipo
  }
  return tramos[tramos.length - 1]?.tipo ?? 28
}

// Base para la tarjeta de Tramos IRPF, YA compensada con pérdidas arrastradas
// de años anteriores (art. 49 LIRPF) — no el neto bruto del año. Reutiliza el
// mismo cálculo que ya hace /api/fiscal/carryforward (tarjeta de Compensación
// de Pérdidas) en vez de duplicarlo con una segunda fuente de verdad.
export function baseTramosCompensada(
  cfYear: CarryforwardDetalle | undefined,
  netoPatrimonialBruto: number,
  totalRendimientos: number
): number {
  if (!cfYear) return netoPatrimonialBruto + totalRendimientos
  return cfYear.netoDespues + (cfYear.rendimientos - cfYear.compensadoRend)
}
