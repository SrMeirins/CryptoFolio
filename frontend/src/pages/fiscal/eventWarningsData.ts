import { ArrowLeftRight, FileQuestion, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FiscalEvent } from './types'

// Avisos de una operación fiscal (#299): datos de los iconos y su tooltip.

export interface Warning { key: string; icon: LucideIcon; label: string; detail: string }

export const WARNINGS: Record<'recompra' | 'wrap' | 'lost', Warning> = {
  recompra: {
    key: 'recompra', icon: Repeat, label: 'Posible pérdida diferida (recompra)',
    detail: 'Recompraste este activo en los 2 meses anteriores o posteriores a la venta con pérdida. Art. 33.5 LIRPF: la pérdida podría no ser computable ahora (aplicación a cripto no pacífica). Consúltalo con tu asesor.',
  },
  wrap: {
    key: 'wrap', icon: ArrowLeftRight, label: 'Wrap de staking tratado como permuta',
    detail: 'El wrap/unwrap de ETH↔BETH (staking de ETH 2.0) se trata como permuta imponible: criterio conservador, sin doctrina de la DGT específica. Algunos asesores lo consideran no imponible al ser 1:1 sobre el mismo derecho. Valídalo con tu asesor.',
  },
  lost: {
    key: 'lost', icon: FileQuestion, label: 'Pérdida sin motivo anotado',
    detail: 'Esta pérdida se computa como 100% deducible, pero su deducibilidad real depende del motivo (estafa, exchange insolvente, clave perdida…). Añade el motivo en las notas de la transacción y valídalo con tu asesor.',
  },
}

export function eventWarnings(e: FiscalEvent): Warning[] {
  return [
    e.posiblePerdidaDiferida && WARNINGS.recompra,
    e.permutaWrapStaking && WARNINGS.wrap,
    e.lostSinMotivo && WARNINGS.lost,
  ].filter((w): w is Warning => !!w)
}

