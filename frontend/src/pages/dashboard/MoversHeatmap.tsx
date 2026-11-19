import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Award, TrendingDown } from 'lucide-react'
import { CryptoIcon } from '../../components/CryptoIcon'
import { distintivos, enlaceCelda, vecinoEnDireccion } from '../../utils/variacionMapa'
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
// Desde #513: logos, insignia de mejor y peor en su casilla, degradado con más
// volumen, fundido del color al cambiar de métrica (24 h o Total, sin nueva
// petición), foco itinerante (un solo Tab entra en el mapa y las flechas se
// mueven por posición, Inicio y Fin a los extremos) y «Otros» abre Portfolio
// filtrado con sus activos.

const HEIGHT = 300
const MIN_SHARE = 0.045

const signedMoney = (n: number, c: Currency) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMoney(Math.abs(n), c)}`

function describe(cell: HeatCell, currency: Currency, marca: string | null): string {
  const head = cell.members.length ? `Otros (${cell.members.join(', ')})` : cell.asset
  const destino = cell.members.length ? 'Ver estos activos en Portfolio' : `Ver ${cell.asset} en Portfolio`
  return `${head}${marca ? `, ${marca.toLowerCase()} activo` : ''}: ${formatPercent(cell.pct, 2, true)}, ${signedMoney(cell.impact, currency)}, valor ${formatMoney(cell.value, currency)}. ${destino}`
}

const ICONO: Record<CellTier, number> = { xl: 26, lg: 20, md: 14, sm: 0 }

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

function Cell({ cell, rect, width, cap, currency, dimmed, marca, focusable, register, onKey, onActive, onOpen }: {
  cell: HeatCell; rect: Rect; width: number; cap: number; currency: Currency; dimmed: boolean
  /** «Mejor» o «Peor» si lo es. */
  marca: 'Mejor' | 'Peor' | null
  /** En el orden de tabulación (foco itinerante). */
  focusable: boolean
  register: (el: HTMLButtonElement | null) => void
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void
  onActive: (active: boolean) => void; onOpen: () => void
}) {
  const flash = useFlashOnChange(Math.round(cell.pct * 100) / 100, 900)
  const background = heatBackground(cell.pct, cap)
  const tier = cellTier((rect.w / 100) * width, (rect.h / 100) * HEIGHT)
  const otros = cell.members.length > 0
  const label = otros ? 'Otros' : cell.asset
  const Icono = marca === 'Mejor' ? Award : TrendingDown
  return (
    <button
      type="button"
      ref={register}
      tabIndex={focusable ? 0 : -1}
      aria-label={describe(cell, currency, marca)}
      onMouseEnter={() => onActive(true)} onFocus={() => onActive(true)} onBlur={() => onActive(false)}
      onKeyDown={onKey}
      onClick={onOpen}
      className="group absolute p-[1.5px] focus:outline-hidden hover:z-10 focus-visible:z-10 cursor-pointer"
      data-heat-tile=""
      data-dimmed={dimmed || undefined}
      style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
    >
      <span
        className={`relative w-full h-full rounded-[10px] flex flex-col items-center justify-center text-center overflow-hidden
          shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.25)]
          transition-[transform,box-shadow,filter,background-color] duration-300 motion-reduce:transition-none
          group-hover:scale-[1.025] group-hover:brightness-115 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_22px_rgba(0,0,0,0.35)]
          group-focus-visible:ring-2 group-focus-visible:ring-brand
          ${flash === 'up' ? 'heat-flash-up' : flash === 'down' ? 'heat-flash-down' : ''}`}
        // Color sólido: al cambiar de métrica la transición de background-color lo funde (#513).
        style={{ backgroundColor: background }}
      >
        {/* Volumen (#513): reflejo superior, brillo en la esquina y sombra inferior sobre el color sólido. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/10 to-transparent" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.12),transparent_55%)]" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/18 to-transparent" />
        {marca && (
          <span aria-hidden="true" className={`absolute top-1 left-1 z-10 inline-flex items-center gap-0.5 rounded-md bg-background-card/90 border border-border px-1 py-px text-[10px] font-semibold ${marca === 'Mejor' ? 'text-positive-ink' : 'text-negative-ink'}`}>
            <Icono size={10} />{tier === 'sm' || tier === 'md' ? null : marca}
          </span>
        )}
        {/* Atenuado (#438): solo el color de fondo se acerca al de la tarjeta; el texto, encima, conserva su contraste. */}
        <span aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-background-card transition-opacity duration-200 motion-reduce:transition-none ${dimmed ? 'opacity-55' : 'opacity-0'}`} />
        <span aria-hidden="true" className="relative flex flex-col items-center leading-tight px-1 max-w-full">
          {!otros && ICONO[tier] > 0 && <span className="mb-0.5"><CryptoIcon symbol={cell.asset} size={ICONO[tier]} /></span>}
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
    <div role="img" className="flex items-center gap-2 text-[11px] text-fg-subtle mono" aria-label={`Escala de color: de −${cap} % a +${cap} %`}>
      <span aria-hidden="true">−{cap}%</span>
      <span aria-hidden="true" className="w-40 h-2 rounded-full"
        style={{ background: `linear-gradient(90deg, ${heatBackground(-cap, cap)}, ${heatBackground(-cap / 4, cap)}, var(--cf-bg-tertiary), ${heatBackground(cap / 4, cap)}, ${heatBackground(cap, cap)})` }} />
      <span aria-hidden="true">+{cap}%</span>
    </div>
  )
}

export function MoversHeatmap({ cells, mode, currency, onOpen, contadores }: {
  cells: HeatCell[]
  mode: MoversMode
  currency: Currency
  /** Abre el destino en Portfolio (un activo o el filtro de «Otros»). */
  onOpen: (href: string) => void
  /** Contadores de la fila de la leyenda (#513). */
  contadores?: ReactNode
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
  const { mejor, peor } = useMemo(() => distintivos(cells), [cells])
  // Foco itinerante: un solo Tab entra en el mapa, en la última casilla enfocada.
  const [foco, setFoco] = useState(0)
  const botones = useRef<Array<HTMLButtonElement | null>>([])
  const tabIndice = foco < cells.length ? foco : 0
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = vecinoEnDireccion(rects, i, e.key)
    if (next === null) return
    e.preventDefault()
    setFoco(next)
    botones.current[next]?.focus()
  }

  return (
    <div className="space-y-2">
      <div ref={ref} role="group" aria-label="Mapa de variación de la cartera: flechas para moverse, Intro para abrir en Portfolio"
        className="relative w-full" style={{ height: HEIGHT }} onMouseLeave={() => setActive(null)}>
        {width > 0 && cells.map((cell, i) => (
          <Cell key={cell.asset} cell={cell} rect={rects[i]} width={width} cap={cap} currency={currency}
            dimmed={active !== null && active !== i}
            marca={i === mejor ? 'Mejor' : i === peor ? 'Peor' : null}
            focusable={i === tabIndice}
            register={el => { botones.current[i] = el }}
            onKey={e => onKey(e, i)}
            onActive={on => { setActive(on ? i : null); if (on) setFoco(i) }}
            onOpen={() => onOpen(enlaceCelda(cell))} />
        ))}

        {activeCell && activeRect && (
          <div role="tooltip"
            className="absolute z-20 pointer-events-none bg-background-card border border-border rounded-xl px-3 py-2.5 shadow-xl text-xs min-w-44"
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
              ? <p className="mt-1.5 text-fg-subtle">{activeCell.members.join(', ')}. Pulsa para verlos en Portfolio</p>
              : <p className="mt-1.5 text-fg-subtle">Pulsa para verlo en Portfolio</p>}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs">{contadores}</div>
        <HeatLegend cap={cap} />
      </div>
    </div>
  )
}
