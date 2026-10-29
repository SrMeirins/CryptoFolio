import { useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Coins, Landmark, Database, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { Badge, tabId, tabPanelId } from '../../components/ui'
import { optionForKey } from '../../utils/segmented'
import { VALID_TABS } from './validTabs'

// Menú de Ajustes (#445): vertical con icono, nombre y un dato corto por
// sección en pantallas anchas; en estrechas, la misma lista en horizontal con
// desplazamiento. Patrón tablist del WAI-ARIA (flechas, Inicio y Fin) y un
// indicador que se desliza hasta la sección activa.

type Section = typeof VALID_TABS[number]

// Vertical desde lg (1024 px), como el diseño; por debajo, horizontal.
const WIDE = '(min-width: 1024px)'
function useWide(): boolean {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia(WIDE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia(WIDE).matches,
    () => true,
  )
}

const META: Record<Section, { label: string; icon: LucideIcon; hint: string }> = {
  wallets: { label: 'Wallets', icon: Wallet, hint: 'Wallets y direcciones' },
  assets:  { label: 'Activos', icon: Coins, hint: 'Pares y precios' },
  fiscal:  { label: 'Fiscal', icon: Landmark, hint: 'Modelo 721 y tramos IRPF' },
  datos:   { label: 'Datos', icon: Database, hint: 'Copias y mantenimiento' },
  general: { label: 'General', icon: SlidersHorizontal, hint: 'Tema, zona y moneda' },
}

export function SettingsNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: portfolioApi.getAssets })
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWallets })
  const unknown = assets.filter(a => !a.is_stablecoin && a.price_source === 'unknown').length
  const userWallets = wallets.filter(w => !w.is_system).length
  const hint = (s: Section) =>
    s === 'wallets' && userWallets > 0 ? `${userWallets} ${userWallets === 1 ? 'wallet' : 'wallets'}`
    : s === 'assets' && assets.length > 0 ? `${assets.length} activos`
    : META[s].hint

  const wide = useWide()
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // El indicador sigue a la sección activa y al tamaño de la lista (vertical u horizontal).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const place = () => {
      const el = list.querySelector<HTMLElement>(`#${CSS.escape(tabId('settings', active))}`)
      if (el) setIndicator({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(list)
    return () => ro.disconnect()
  }, [active])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(VALID_TABS, active, e.key)
    if (next === null) return
    e.preventDefault()
    onChange(next)
    document.getElementById(tabId('settings', next))?.focus()
  }

  return (
    <div ref={listRef} role="tablist" aria-label="Secciones de Ajustes" aria-orientation={wide ? 'vertical' : 'horizontal'} onKeyDown={onKeyDown}
      className="relative flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {indicator && (
        <span aria-hidden="true" className="settings-nav-indicator absolute left-0 top-0 rounded-xl bg-brand/10 ring-1 ring-brand/25 pointer-events-none"
          style={{ width: indicator.w, height: indicator.h, transform: `translate(${indicator.x}px, ${indicator.y}px)` }} />
      )}
      {VALID_TABS.map(s => {
        const { label, icon: Icon } = META[s]
        const on = s === active
        return (
          <button key={s} id={tabId('settings', s)} type="button" role="tab" aria-selected={on}
            aria-controls={tabPanelId('settings')} tabIndex={on ? 0 : -1} onClick={() => onChange(s)}
            className={`relative shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              on ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-overlay/4'}`}>
            <span aria-hidden="true" className={`hidden lg:grid w-8 h-8 rounded-lg place-items-center shrink-0 transition-colors ${on ? 'bg-brand/15 text-brand-ink' : 'bg-overlay/5 text-fg-subtle'}`}>
              <Icon size={15} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                {label}
                {s === 'assets' && unknown > 0 && <Badge tone="negative">{unknown}<span className="sr-only"> sin precio</span></Badge>}
              </span>
              <span className="hidden lg:block text-[11px] text-fg-subtle truncate">{hint(s)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
