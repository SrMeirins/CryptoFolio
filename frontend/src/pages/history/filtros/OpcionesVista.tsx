import { useId, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Hint, iconButtonClasses, Popover, SegmentedControl, Switch } from '../../../components/ui'
import { useHistorialDensidad } from '../../../hooks/useHistorialDensidad'
import { DENSIDAD_OPCIONES } from '../../../utils/historialDensidad'

// Opciones de vista del Historial (#552), aparte de los filtros porque no
// cambian qué operaciones se ven, sino cómo: agrupar cada comisión dentro de
// su compra o venta y la densidad de la tabla (también en Ajustes › General).

export function OpcionesVista({ agruparComisiones, onAgruparComisiones }: {
  agruparComisiones: boolean
  onAgruparComisiones: (v: boolean) => void
}) {
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const { densidad, cambiar } = useHistorialDensidad()
  return (
    <>
      <Hint label="Opciones de vista">
        <button ref={boton} type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="dialog" aria-expanded={abierto}
          aria-label="Opciones de vista" className={iconButtonClasses('md', abierto)}>
          <Settings2 size={14} aria-hidden="true" />
        </button>
      </Hint>
      <Popover open={abierto} onClose={() => setAbierto(false)} anchorRef={boton} align="end" className="p-4 w-72 space-y-4"
        ariaProps={{ role: 'dialog', 'aria-label': 'Opciones de vista' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor={`${id}-agrupar`} className="block text-sm font-medium text-fg">Agrupar comisiones</label>
            <p id={`${id}-agrupar-ayuda`} className="text-[11px] text-fg-subtle">Cada comisión, dentro de su compra o venta.</p>
          </div>
          <Switch id={`${id}-agrupar`} checked={agruparComisiones} onChange={onAgruparComisiones} describedBy={`${id}-agrupar-ayuda`} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-fg">Densidad de la tabla</p>
          <SegmentedControl label="Densidad de la tabla" value={densidad} onChange={v => void cambiar(v)}
            options={DENSIDAD_OPCIONES.map(o => ({ value: o.value, label: o.label }))} />
        </div>
      </Popover>
    </>
  )
}
