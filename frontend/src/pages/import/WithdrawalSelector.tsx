import { Dropdown } from '../../components/ui'
import { opcionesDestino } from './destinoOpciones'
import { SPECIAL_DESTINATIONS } from './specialDestinations'

// Selector de destino de un retiro sobre el desplegable del kit (#321): teclado,
// lector de pantalla, grupos y descripción. El borde refuerza el estado elegido.
export function WithdrawalSelector({ value, coldWallets, onChange, label = 'Destino del retiro', placeholder = 'Sin asignar (requerido)' }: {
  value: string
  coldWallets: { id: string; name: string; color: string }[]
  onChange: (v: string) => void
  label?: string
  placeholder?: string
}) {
  const especial = SPECIAL_DESTINATIONS.find(s => s.id === value)
  const tono = !value ? '' : especial ? especial.trigger : coldWallets.some(w => w.id === value) ? 'border-positive/40 bg-positive/8' : ''
  return (
    <Dropdown label={label} value={value} onChange={onChange} options={opcionesDestino(coldWallets)} placeholder={placeholder}
      size="sm" align="end" searchable={false} className={`min-w-44 max-w-60 text-xs ${tono}`} />
  )
}
