// Preferencias de la página Portfolio recordadas en este navegador (#269) y
// atajo de teclado del buscador. Si el almacenamiento no está disponible,
// valen solo para la sesión.

import type { PortfolioView } from './portfolioView'

export type Density = 'comfortable' | 'compact'

const DENSITY_KEY = 'cryptofolio.portfolio.density'
const DUST_KEY = 'cryptofolio.portfolio.dustOpen'
const VIEW_KEY = 'cryptofolio.portfolio.view'

/** Vista de la tabla (#271): «Por activo» por defecto. */
export function readView(): PortfolioView {
  try { return localStorage.getItem(VIEW_KEY) === 'wallet' ? 'wallet' : 'asset' } catch { return 'asset' }
}

export function saveView(view: PortfolioView): void {
  try { localStorage.setItem(VIEW_KEY, view) } catch { /* almacenamiento no disponible */ }
}

export function readDensity(): Density {
  try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable' } catch { return 'comfortable' }
}

export function saveDensity(density: Density): void {
  try { localStorage.setItem(DENSITY_KEY, density) } catch { /* almacenamiento no disponible */ }
}

/** Saldos residuales abiertos o plegados; null si nunca se ha elegido (#530). */
export function readDustOpen(): boolean | null {
  try {
    const v = localStorage.getItem(DUST_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch { return null }
}

export function saveDustOpen(open: boolean): void {
  try { localStorage.setItem(DUST_KEY, open ? '1' : '0') } catch { /* almacenamiento no disponible */ }
}

/** «/» enfoca el buscador, salvo si ya se está escribiendo en un campo o con modificadores. */
export function isSearchShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }): boolean {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return false
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null
  if (!t) return true
  return !(t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName ?? ''))
}
