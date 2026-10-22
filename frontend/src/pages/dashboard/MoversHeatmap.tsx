import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cellTier, squarify, withMinShare, type CellTier, type Rect } from '../../utils/squarify'
import { HEAT_CAP, heatBackground, type HeatCell, type MoversMode } from '../../utils/topMovers'
import { formatMoney, formatPercent, formatPrice, type Currency } from '../../utils/format'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'

// Mapa de calor de la cartera (#233), con acabado de visor de mercado:
// - Área según el valor de la posición, con un mínimo del 4,5 % para que toda
//   celda tenga sitio para sus siglas; el detalle se adapta a su tamaño real.
// - Color según la variación (satura en ±5 % en 24 h y ±50 % en Total), con
//   relieve (degradado, reflejo superior y sombra) y destello al cambiar.
// - Al pasar o enfocar se eleva y atenúa el resto; muestra el detalle. Al
//   pulsar abre el activo en Portfolio.

const HEIGHT = 300
const MIN_SHARE = 0.045

const signedMoney = (n: number, c: Currency) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMoney(Math.abs(n), c)}`

function describe(cell: HeatCell, currency: Currency): string {
  const head = cell.members.length ? `Otros (${cell.members.join(', ')})` : cell.asset
  return `${head}: ${formatPercent(cell.pct, 2, true)}, ${signedMoney(cell.impact, currency)}, valor ${formatMoney(cell.value, currency)}`
}

/** Ancho real del contenedor, para calcular las celdas en píxeles. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// Misma escala tipográfica que el resto de la app: nombres en seminegrita
// (como el ranking) y cifras con la utilidad `mono` (Inter, cifras tabulares).
const TEXT: Record<CellTier, { asset: string; pct: string }> = {
  xl: { asset: 'text-sm', pct: 'text-lg' },
  lg: { asset: 'text-[13px]', pct: 'text-[15px]' },
  md: { asset: 'text-xs', pct: 'text-xs' },
  sm: { asset: 'text-[11px]', pct: 'text-[10px]' },
}

function Cell({ cell, rect, width, cap, currency, dimmed, onActive, onOpen }: {
  cell: HeatCell; rect: Rect; width: number; cap: number; currency: Currency; dimmed: boolean
  onActive: (active: boolean) => void; onOpen: () => void
}) {
  const flash = useFlashOnChange(Math.round(cell.pct * 100) / 100, 900)
  const background = heatBackground(cell.pct, cap)
  const tier = cellTier((rect.w / 100) * width, (rect.h / 100) * HEIGHT)
  const clickable = cell.members.length === 0
  const label = cell.members.length ? 'Otros' : cell.asset
  return (
    <button
      type="button"
      aria-label={describe(cell, currency)}
      onMouseEnter={() => onActive(true)} onFocus={() => onActive(true)} onBlur={() => onActive(false)}
      onClick={() => clickable && onOpen()}
      className={`group absolute p-[1.5px] focus:outline-hidden hover:z-10 focus-visible:z-10 transition-opacity duration-200 ${dimmed ? 'opacity-60' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
    >
      <span
        className={`relative w-full h-full rounded-[10px] flex flex-col items-center justify-center text-center overflow-hidden
          shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.25)]
          transition-[transform,box-shadow,filter] duration-200 motion-reduce:transition-none
          group-hover:scale-[1.025] group-hover:brightness-115 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_22px_rgba(0,0,0,0.35)]
          group-focus-visible:ring-2 group-focus-visible:ring-brand
          ${flash === 'up' ? 'heat-flash-up' : flash === 'down' ? 'heat-flash-down' : ''}`}
        style={{ background }}
      >
        {/* Reflejo superior para dar relieve */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/8 to-transparent" />
        <span aria-hidden="true" className="relative flex flex-col items-center leading-tight px-1 max-w-full">
          <span className={`font-semibold text-fg truncate max-w-full ${TEXT[tier].asset}`}>{label}</span>
          <span className={`mono font-bold text-fg ${TEXT[tier].pct}`}>
            {formatPercent(cell.pct, tier === 'xl' || tier === 'lg' ? 2 : 1, true)}
          </span>
          {(tier === 'xl' || tier === 'lg') && (
            <span className="mono text-xs text-fg mt-0.5">{signedMoney(cell.impact, currency)}</span>
          )}
          {tier === 'xl' && cell.price !== null && (
            <span className="mono text-[11px] text-fg">{formatPrice(cell.price, currency)}</span>
          )}
        </span>
      </span>
    </button>
  )
}

/** Leyenda de la escala de color, de −tope a +tope. */
function HeatLegend({ cap }: { cap: number }) {
  return (
    <div role="img" className="flex items-center justify-end gap-2 text-[11px] text-fg-subtle mono" aria-label={`Escala de color: de −${cap} % a +${cap} %`}>
      <span aria-hidden="true">−{cap}%</span>
      <span aria-hidden="true" className="w-40 h-2 rounded-full"
        style={{ background: `linear-gradient(90deg, ${heatBackground(-cap, cap)}, ${heatBackground(-cap / 4, cap)}, var(--cf-bg-tertiary), ${heatBackground(cap / 4, cap)}, ${heatBackground(cap, cap)})` }} />
      <span aria-hidden="true">+{cap}%</span>
    </div>
  )
}

export function MoversHeatmap({ cells, mode, currency, onOpen }: {
  cells: HeatCell[]
  mode: MoversMode
  currency: Currency
  onOpen: (asset: string) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const rects = useMemo(
    () => squarify(withMinShare(cells.map(c => c.value), MIN_SHARE), Math.max(width, 1), HEIGHT),
    [cells, width],
  )
  const [active, setActive] = useState<number | null>(null)
  const cap = HEAT_CAP[mode]
  const activeCell = active === null ? null : cells[active]
  const activeRect = active === null ? null : rects[active]

  return (
    <div className="space-y-2">
      <div ref={ref} className="relative w-full" style={{ height: HEIGHT }} onMouseLeave={() => setActive(null)}>
        {width > 0 && cells.map((cell, i) => (
          <Cell key={cell.asset} cell={cell} rect={rects[i]} width={width} cap={cap} currency={currency}
            dimmed={active !== null && active !== i}
            onActive={on => setActive(on ? i : null)}
            onOpen={() => onOpen(cell.asset)} />
        ))}

        {activeCell && activeRect && (
          <div role="tooltip"
            className="absolute z-20 pointer-events-none bg-tooltip/95 border border-overlay/10 rounded-xl px-3 py-2.5 shadow-xl text-xs min-w-44"
            style={{
              left: `${Math.min(Math.max(activeRect.x + activeRect.w / 2, 12), 88)}%`,
              top: activeRect.y > 40 ? `${activeRect.y}%` : `${activeRect.y + activeRect.h}%`,
              transform: `translate(-50%, ${activeRect.y > 40 ? 'calc(-100% - 6px)' : '6px'})`,
            }}>
            <p className="font-semibold text-fg mb-1">{activeCell.members.length ? 'Otros' : activeCell.asset}</p>
            <dl className="space-y-0.5">
              <div className="flex justify-between gap-4"><dt className="text-fg-subtle">{mode === '24h' ? 'Variación 24 h' : 'Desde la compra'}</dt>
                <dd className={`mono ${activeCell.pct >= 0 ? 'text-positive' : 'text-negative'}`}>{formatPercent(activeCell.pct, 2, true)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-fg-subtle">Impacto</dt>
                <dd className={`mono ${activeCell.impact >= 0 ? 'text-positive' : 'text-negative'}`}>{signedMoney(activeCell.impact, currency)}</dd></div>
              {activeCell.price !== null && (
                <div className="flex justify-between gap-4"><dt className="text-fg-subtle">Precio</dt><dd className="mono text-fg">{formatPrice(activeCell.price, currency)}</dd></div>
              )}
              <div className="flex justify-between gap-4"><dt className="text-fg-subtle">Valor</dt><dd className="mono text-fg">{formatMoney(activeCell.value, currency)}</dd></div>
            </dl>
            {activeCell.members.length > 0
              ? <p className="mt-1.5 text-fg-subtle">{activeCell.members.join(', ')}</p>
              : <p className="mt-1.5 text-fg-subtle">Pulsa para verlo en Portfolio</p>}
          </div>
        )}
      </div>
      <HeatLegend cap={cap} />
    </div>
  )
}
