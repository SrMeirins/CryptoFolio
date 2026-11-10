import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { panelSurface } from '../../components/ui'

/**
 * Tarjeta con cabecera icono+título (+ slot derecho opcional) común a los
 * gráficos y tarjetas fiscales — mismo patrón repetido en Charts.tsx (3
 * sitios) y TaxCards.tsx (2 sitios, pendiente de migrar en su propio turno).
 */
export function FiscalChartCard({ icon: Icon, title, right, children }: {
  icon: LucideIcon
  title: ReactNode
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={panelSurface('md')}>
      {/* Altura mínima común (#539): con o sin control a la derecha, los títulos de paneles vecinos quedan alineados. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 min-h-8">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-fg-subtle" />
          <h3 className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}
