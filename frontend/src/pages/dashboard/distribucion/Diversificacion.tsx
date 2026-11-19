import { Scale } from 'lucide-react'
import { InfoTooltip } from '../../../components/InfoTooltip'
import type { AllocationMode } from '../../../utils/allocation'

// Diversificación de la cartera (#514): número efectivo de activos (o de
// wallets), la inversa del índice de Herfindahl, con su ayuda.

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: n < 10 ? 1 : 0 })

export function Diversificacion({ efectivo, total, mode }: { efectivo: number; total: number; mode: AllocationMode }) {
  if (total === 0) return null
  const que = mode === 'asset' ? 'activos' : 'wallets'
  return (
    <p data-testid="diversificacion" className="flex items-center gap-1.5 text-xs text-fg-muted">
      <Scale size={13} aria-hidden="true" className="text-fg-subtle" />
      <span>Diversificación:</span>
      <span>equivale a <span className="mono font-semibold text-fg">{fmt(efectivo)}</span> {que} de igual peso</span>
      <span className="text-fg-subtle">(de {total})</span>
      <InfoTooltip label="Qué mide la diversificación">
        <p>Es el número efectivo de {que}: cuántos {que} con el mismo peso repartirían el riesgo igual que tu cartera. Se calcula como 1 dividido por la suma de los pesos al cuadrado (la inversa del índice de Herfindahl).</p>
        <p className="mt-1.5 text-fg-subtle">Si tienes {total} {que} pero sale un número mucho menor, unos pocos concentran casi todo el valor. Cuenta todos, también los agrupados en «Otros»{mode === 'asset' ? ' y el efectivo' : ''}.</p>
      </InfoTooltip>
    </p>
  )
}
