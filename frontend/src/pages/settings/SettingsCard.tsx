import type { ReactNode } from 'react'

/**
 * Tarjeta con título + descripción + acción opcional en cabecera, común a
 * los bloques de Ajustes — mismo patrón repetido en GeneralSection.tsx y
 * DatosSection.tsx (pendientes de migrar en su propio turno).
 */
export function SettingsCard({ title, description, action, children }: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
