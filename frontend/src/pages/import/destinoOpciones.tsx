import type { DropdownOption } from '../../components/ui'
import { SPECIAL_DESTINATIONS } from './specialDestinations'

// Opciones del selector de destino de un retiro (#321): wallets propias y destinos especiales, agrupados.
export function opcionesDestino(wallets: readonly { id: string; name: string; color: string }[]): DropdownOption<string>[] {
  return [
    ...wallets.map(w => ({
      value: w.id, label: w.name, group: 'Mis wallets',
      prefix: <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} aria-hidden="true" />,
    })),
    ...SPECIAL_DESTINATIONS.map(s => {
      const Icon = s.icon
      return { value: s.id, label: s.label, description: s.desc, group: 'Otros destinos', prefix: <Icon size={14} className={`shrink-0 ${s.tone}`} aria-hidden="true" /> }
    }),
  ]
}
