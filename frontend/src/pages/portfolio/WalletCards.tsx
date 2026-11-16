import { useEffect, useState } from 'react'
import { X, Building2, Smartphone, Usb, Banknote, Layers, Wallet as WalletIcon, type LucideIcon } from 'lucide-react'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { ink } from '../../utils/colors'
import { NEUTRAL_COLOR } from '../../utils/allocation'
import { CryptoIcon } from '../../components/CryptoIcon'
import { agruparOtras, flexTarjeta, type GrupoOtras } from '../../utils/walletLayout'
import type { WalletSummary } from '../../utils/portfolioInventory'

// Tarjetas de wallet de Portfolio (#270, #283, #526): opacas, con ancho
// proporcional a su peso (la principal, la más ancha) y un mínimo legible.
// Cada una dice su tipo, % de la cartera, valor, P&L y número de activos, la
// barra de composición con los colores de Distribución y hasta 6 activos con
// su peso y P&L. Dos destinos, ambos con teclado: la cabecera de la tarjeta
// filtra la tabla (?wallet=) y cada activo abre su detalle. Las wallets
// pequeñas van juntas en «Otras». Pasar el ratón (o el foco) por un tramo de
// la barra o por un activo de la lista resalta los dos y atenúa el resto; el
// tramo muestra su activo, peso y valor (el mismo dato está en la lista).

const KIND_LABEL: Record<string, string> = {
  exchange: 'Exchange', hardware: 'Hardware', software: 'Software', cold: 'Frío', hot: 'Caliente',
}
const KIND_ICON: Record<string, LucideIcon> = {
  exchange: Building2, software: Smartphone, hot: Smartphone, hardware: Usb, cold: Usb,
}
const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

function Tarjeta({ w, on, colores, onSelect, onDetalle }: {
  w: WalletSummary
  on: boolean
  colores: ReadonlyMap<string, string>
  onSelect: () => void
  onDetalle: (asset: string) => void
}) {
  const currency = useCurrency()
  const money = (v: number) => formatMoney(v, currency)
  const Icono = KIND_ICON[w.kind] ?? (w.kind ? WalletIcon : Banknote)
  const { top, others } = w.composition
  const color = (asset: string) => colores.get(asset) ?? NEUTRAL_COLOR
  const pnlTono = w.pnl === null ? '' : w.pnl >= 0 ? 'bg-positive/10 text-positive-ink' : 'bg-negative/10 text-negative-ink'
  // Activo resaltado entre la barra y la lista.
  const [resaltado, setResaltado] = useState<string | null>(null)
  // La barra crece desde cero al aparecer (sin animación con «reducir movimiento», por CSS global).
  const [lista, setLista] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setLista(true)); return () => cancelAnimationFrame(id) }, [])
  const atenuar = (asset: string) => (resaltado !== null && resaltado !== asset ? 0.3 : 1)
  // Posición del tooltip: el centro del tramo resaltado.
  const centro = new Map(top.map((p, i) => [p.asset, top.slice(0, i).reduce((t, x) => t + x.pct, 0) + p.pct / 2]))
  const tramo = top.find(p => p.asset === resaltado)
  return (
    <li className={`flex flex-col rounded-2xl border bg-background-card overflow-hidden transition-shadow ${on ? 'border-brand ring-2 ring-brand/40' : 'border-border'}`}
      style={{ flex: flexTarjeta(w.pct), borderTopColor: w.color, borderTopWidth: 4, backgroundImage: `linear-gradient(to bottom, ${w.color}1f, transparent 5.5rem)` }}>
      <button type="button" onClick={onSelect} aria-pressed={on}
        aria-label={`${w.name}: ${formatPercent(w.pct, 1)} de la cartera, ${money(w.value)}. ${on ? 'Quitar el filtro de la tabla' : 'Filtrar la tabla por esta wallet'}`}
        className={`text-left px-4 pt-3 pb-2 hover:bg-overlay/3 ${FOCO}`}>
        <span className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center size-7 rounded-lg shrink-0" style={{ backgroundColor: `${w.color}22`, color: ink(w.color) }}>
            <Icono size={14} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg truncate">{w.name}</span>
            <span className="block text-[11px] text-fg-subtle">{KIND_LABEL[w.kind] ?? (w.kind || 'Fiat')} · {formatPercent(w.pct, 1)} de la cartera</span>
          </span>
        </span>
        <span className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className="text-xl font-bold mono tabular-nums text-fg">{money(w.value)}</span>
          {w.pnl !== null && (
            <span className={`mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${pnlTono}`}>
              {w.pnl >= 0 ? '+' : ''}{money(w.pnl)}{w.pnlPct !== null ? ` · ${formatPercent(w.pnlPct, 1, true)}` : ''}
            </span>
          )}
          <span className="text-[11px] text-fg-subtle">{w.assetCount} {w.assetCount === 1 ? 'activo' : 'activos'}</span>
        </span>
      </button>

      <div className="px-4 pb-3 space-y-2">
        <div className="relative pt-1" aria-hidden="true" onMouseLeave={() => setResaltado(null)}>
          {tramo && (
            <span className="absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-background-card px-2 py-1 text-[11px] shadow-lg pointer-events-none z-10"
              style={{ left: `clamp(3rem, ${centro.get(tramo.asset)}%, calc(100% - 3rem))` }}>
              <span className="mono font-semibold text-fg">{tramo.asset}</span>{' '}
              <span className="mono text-fg-muted">{formatPercent(tramo.pct, 1)} · {money(tramo.value)}</span>
            </span>
          )}
          <span className="flex h-3 gap-0.5">
            {top.map(p => (
              <span key={p.asset} onMouseEnter={() => setResaltado(p.asset)}
                className="h-full rounded-[3px] first:rounded-l-full last:rounded-r-full transition-[width,opacity] duration-500 ease-out cursor-default"
                style={{ width: lista ? `${p.pct}%` : '0%', backgroundColor: color(p.asset), opacity: atenuar(p.asset) }} />
            ))}
            {others.value > 0 && (
              <span className="h-full rounded-[3px] last:rounded-r-full bg-fg-subtle/40 transition-[width,opacity] duration-500 ease-out"
                style={{ width: lista ? `${others.pct}%` : '0%', opacity: resaltado ? 0.3 : 1 }} />
            )}
          </span>
        </div>
        {/* En tarjetas anchas, en columnas: cada activo cerca de su peso y su P&L */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-0.5 text-xs" aria-label={`Activos de ${w.name}`}>
          {top.map(p => (
            <li key={p.asset} onMouseEnter={() => setResaltado(p.asset)} onMouseLeave={() => setResaltado(null)}>
              <button type="button" onClick={() => onDetalle(p.asset)} onFocus={() => setResaltado(p.asset)} onBlur={() => setResaltado(null)}
                aria-label={`${p.asset}: ${formatPercent(p.pct, 1)} de ${w.name}${p.pnlPct !== null ? `, P&L ${formatPercent(p.pnlPct, 1, true)}` : ''}. Ver su detalle`}
                className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 transition-[background-color,opacity] ${resaltado === p.asset ? 'bg-overlay/8' : 'hover:bg-overlay/5'} ${FOCO}`}
                style={{ opacity: resaltado !== null && resaltado !== p.asset ? 0.55 : 1 }}>
                <span className="rounded-full shrink-0 grid place-items-center" aria-hidden="true" style={{ boxShadow: `0 0 0 2px ${color(p.asset)}` }}>
                  <CryptoIcon symbol={p.asset} size={16} />
                </span>
                <span className="mono font-semibold text-fg">{p.asset}</span>
                <span className="mono text-fg-muted ml-auto">{formatPercent(p.pct, 1)}</span>
                <span className={`mono w-16 text-right ${p.pnlPct === null ? 'text-fg-subtle' : p.pnlPct >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {p.pnlPct === null ? 'sin coste' : formatPercent(p.pnlPct, 1, true)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {others.count > 0 && <p className="text-[11px] text-fg-subtle px-1.5">Y {others.count} más ({formatPercent(others.pct, 1)})</p>}
      </div>
    </li>
  )
}

function TarjetaOtras({ g, selected, onSelect }: { g: GrupoOtras; selected: string | null; onSelect: (id: string | null) => void }) {
  const currency = useCurrency()
  return (
    <li className="flex flex-col rounded-2xl border border-border bg-background-card overflow-hidden"
      style={{ flex: flexTarjeta(g.pct), borderTopColor: NEUTRAL_COLOR, borderTopWidth: 4, backgroundImage: `linear-gradient(to bottom, ${NEUTRAL_COLOR}1f, transparent 5.5rem)` }}>
      <div className="px-4 pt-3 pb-2">
        <span className="flex items-center gap-2">
          <span className="grid place-items-center size-7 rounded-lg bg-overlay/8 text-fg-muted"><Layers size={14} aria-hidden="true" /></span>
          <span>
            <span className="block text-sm font-semibold text-fg">Otras ({g.wallets.length})</span>
            <span className="block text-[11px] text-fg-subtle">{formatPercent(g.pct, 1)} de la cartera</span>
          </span>
        </span>
        <span className="mt-2 block text-xl font-bold mono tabular-nums text-fg">{formatMoney(g.value, currency)}</span>
      </div>
      <ul className="px-4 pb-3 space-y-0.5 text-xs" aria-label="Wallets pequeñas">
        {g.wallets.map(w => (
          <li key={w.walletId}>
            <button type="button" onClick={() => onSelect(selected === w.walletId ? null : w.walletId)} aria-pressed={selected === w.walletId}
              aria-label={`${w.name}: ${formatPercent(w.pct, 1)} de la cartera. Filtrar la tabla por esta wallet`}
              className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-overlay/5 ${FOCO}`}>
              <span className="size-2 rounded-full shrink-0" aria-hidden="true" style={{ backgroundColor: w.color }} />
              <span className="text-fg truncate">{w.name}</span>
              <span className="mono text-fg-muted ml-auto">{formatPercent(w.pct, 1)}</span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}

export function WalletCards({ wallets, selected, onSelect, onDetalle, colores, umbralOtras }: {
  wallets: WalletSummary[]
  selected: string | null
  onSelect: (walletId: string | null) => void
  onDetalle: (asset: string) => void
  /** Color de cada activo, el mismo que en Distribución. */
  colores: ReadonlyMap<string, string>
  /** % por debajo del cual una wallet va a «Otras» (Ajustes > General). */
  umbralOtras: number
}) {
  const active = wallets.find(w => w.walletId === selected)
  const { principales, otras } = agruparOtras(wallets, umbralOtras, selected)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 min-h-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Wallets</h2>
        {active && (
          <button type="button" onClick={() => onSelect(null)}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-overlay/5 transition-colors ${FOCO}`}>
            Mostrando solo <span className="font-medium" style={{ color: ink(active.color) }}>{active.name}</span>
            <X size={12} aria-hidden="true" /><span className="sr-only">Quitar el filtro</span>
          </button>
        )}
      </div>
      <ul className="flex flex-wrap gap-3" aria-label="Wallets: la cabecera de cada tarjeta filtra la tabla y cada activo abre su detalle">
        {principales.map(w => (
          <Tarjeta key={w.walletId} w={w} on={w.walletId === selected} colores={colores}
            onSelect={() => onSelect(w.walletId === selected ? null : w.walletId)} onDetalle={onDetalle} />
        ))}
        {otras && <TarjetaOtras g={otras} selected={selected} onSelect={onSelect} />}
      </ul>
    </div>
  )
}
