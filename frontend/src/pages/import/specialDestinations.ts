import { T } from '../../utils/colors'
// Destinos especiales de un retiro que no corresponden a ninguna wallet registrada.
export const SPECIAL_DESTINATIONS = [
  {
    id: '__external__',
    icon: '📱',
    label: 'Mi wallet no registrada',
    desc: 'MetaMask, Phantom, Trust Wallet... El activo sigue siendo tuyo.',
    color: T.muted,
  },
  {
    id: '__gift__',
    icon: '🎁',
    label: 'Regalo o pago a tercero',
    desc: 'Transmisión patrimonial al precio de mercado del día.',
    color: T.brand,
  },
  {
    id: '__lost__',
    icon: '💀',
    label: 'Pérdida de acceso',
    desc: 'Keys perdidas, hack... Pérdida patrimonial registrada en el FIFO.',
    color: T.negative,
  },
]
