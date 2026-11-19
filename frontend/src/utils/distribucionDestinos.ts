import type { AllocationItem, AllocationMode } from './allocation'

// Destinos de cada fila de Distribución (#514): Portfolio (el activo, la
// wallet o el grupo) y el Historial con el mismo filtro, con sus nombres
// accesibles. Las wallets agrupadas en «Otros» no tienen destino común: solo
// se despliegan. Función pura.

export interface Destinos {
  portfolio: { to: string; nombre: string } | null
  historial: { to: string; nombre: string } | null
}

const q = (s: string) => encodeURIComponent(s)

export function destinosDistribucion(item: AllocationItem, mode: AllocationMode): Destinos {
  if (item.kind === 'other') {
    if (mode === 'wallet') return { portfolio: null, historial: null }
    const lista = item.members.map(m => q(m.key)).join(',')
    return {
      portfolio: { to: `/portfolio?activos=${lista}`, nombre: 'Ver los activos de «Otros» en Portfolio' },
      historial: { to: `/history?activo=${lista}`, nombre: 'Ver las operaciones de «Otros» en el Historial' },
    }
  }
  if (item.kind === 'wallet') {
    return {
      portfolio: { to: `/portfolio?wallet=${q(item.key)}`, nombre: `Ver la wallet ${item.label} en Portfolio` },
      historial: { to: `/history?wallet=${q(item.key)}`, nombre: `Ver las operaciones de ${item.label} en el Historial` },
    }
  }
  // El detalle de Portfolio es solo de activos cripto: el efectivo abre la cartera.
  return {
    portfolio: item.kind === 'fiat'
      ? { to: '/portfolio', nombre: 'Ver la cartera en Portfolio' }
      : { to: `/portfolio?activo=${q(item.key)}`, nombre: `Ver ${item.label} en Portfolio` },
    historial: { to: `/history?activo=${q(item.key)}`, nombre: `Ver las operaciones de ${item.label} en el Historial` },
  }
}
