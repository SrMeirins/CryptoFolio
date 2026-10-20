import { Gift, ShieldOff, Wallet, type LucideIcon } from 'lucide-react'

// Destinos especiales de un retiro que no corresponden a ninguna wallet registrada.
// Iconos del sistema en lugar de emojis (#321): el texto dice lo mismo, el color refuerza.
export interface DestinoEspecial {
  id: '__external__' | '__gift__' | '__lost__'
  icon: LucideIcon
  label: string
  desc: string
  /** Clases de color del icono y del texto. */
  tone: string
  /** Borde y fondo del selector cuando está elegido. */
  trigger: string
}

export const SPECIAL_DESTINATIONS: readonly DestinoEspecial[] = [
  {
    id: '__external__', icon: Wallet, label: 'Mi wallet no registrada',
    desc: 'MetaMask, Phantom, Trust Wallet… El activo sigue siendo tuyo.',
    tone: 'text-fg-muted', trigger: 'border-border bg-overlay/5',
  },
  {
    id: '__gift__', icon: Gift, label: 'Regalo o pago a tercero',
    desc: 'Transmisión patrimonial al precio de mercado del día.',
    tone: 'text-brand', trigger: 'border-brand/40 bg-brand/8',
  },
  {
    id: '__lost__', icon: ShieldOff, label: 'Pérdida de acceso',
    desc: 'Keys perdidas, hack… Pérdida patrimonial registrada en el FIFO.',
    tone: 'text-negative', trigger: 'border-negative/40 bg-negative/8',
  },
]

/** Nombre legible de un destino (wallet o especial); null si ya no existe. */
export function etiquetaDestino(dest: string, wallets: readonly { id: string; name: string }[]): string | null {
  return SPECIAL_DESTINATIONS.find(s => s.id === dest)?.label ?? wallets.find(w => w.id === dest)?.name ?? null
}
