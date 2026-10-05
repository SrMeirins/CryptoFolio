import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

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
    <div className="bg-background-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-gray-500" />
          <h3 className="text-[11px] text-gray-500 font-medium uppercase tracking-widest">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}
