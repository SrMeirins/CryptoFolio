import type { CarryforwardDetalle } from '../pages/fiscal/types'

export interface Tramo { hasta: number; tipo: number; label: string }

// Escala vigente de la base del ahorro (desde 2025, Ley 7/2024): solo es el
// valor provisional mientras llega la escala del ejercicio desde la API (#452),
// que guarda las oficiales de cada año y los tipos cambiados en Ajustes.
export const TRAMOS_DEFAULT: Tramo[] = [
  { hasta: 6_000,    tipo: 19, label: '0 – 6.000 €' },
  { hasta: 50_000,   tipo: 21, label: '6.001 – 50.000 €' },
  { hasta: 200_000,  tipo: 23, label: '50.001 – 200.000 €' },
  { hasta: 300_000,  tipo: 27, label: '200.001 – 300.000 €' },
  { hasta: Infinity, tipo: 30, label: '> 300.000 €' },
]

// Miles con punto siempre, también con cuatro cifras («6.000»): Intl en español no agrupa esas.
const eur = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/**
 * Tramos con su etiqueta a partir de la escala de un ejercicio (#452): «0 –
 * 6.000 €», «6.001 – 50.000 €» y «> X €» en el último (sin límite).
 */
export function tramosDeEscala(escala: ReadonlyArray<{ hasta: number | null; tipo: number }>): Tramo[] {
  return escala.map((t, i) => {
    const desde = i === 0 ? 0 : (escala[i - 1].hasta ?? 0)
    const hasta = t.hasta ?? Infinity
    const label = t.hasta === null ? `> ${eur(desde)} €` : `${i === 0 ? '0' : eur(desde + 1)} – ${eur(hasta)} €`
    return { hasta, tipo: t.tipo, label }
  })
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
