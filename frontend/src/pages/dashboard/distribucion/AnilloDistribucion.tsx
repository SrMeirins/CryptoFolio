import { PieChart as RPieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'
import type { PieSectorDataItem } from 'recharts/types/polar/Pie'
import { NEUTRAL_COLOR, type AllocationItem, type AllocationMode } from '../../../utils/allocation'
import { formatMoney, formatPercent, type Currency } from '../../../utils/format'
import { useReducedMotion } from '../../../hooks/useReducedMotion'

// Anillo de Distribución (#235; realce desde #514): el segmento enfocado sale
// hacia fuera y el resto se atenúa, con su cifra en el centro. Al pasar de
// Activo a Wallet el anillo se vuelve a dibujar con su animación de entrada
// (salvo con «reducir movimiento»). Decorativo para lectores de pantalla: la
// lista tiene los mismos datos.

const FIAT_PATTERN = 'allocation-fiat-pattern'
const RADIO_INT = 70
const RADIO_EXT = 104

/** Segmento enfocado: más grueso hacia fuera, con un halo del mismo color. */
function SegmentoActivo(props: PieSectorDataItem) {
  const { cx, cy, innerRadius = RADIO_INT, outerRadius = RADIO_EXT, startAngle, endAngle, fill, cornerRadius } = props
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 7} startAngle={startAngle} endAngle={endAngle}
        fill={fill} cornerRadius={cornerRadius} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 9} outerRadius={outerRadius + 11} startAngle={startAngle} endAngle={endAngle}
        fill={fill} opacity={0.45} />
    </g>
  )
}

export function AnilloDistribucion({ items, mode, active, total, currency, onActive }: {
  items: readonly AllocationItem[]
  mode: AllocationMode
  active: string | null
  total: number
  currency: Currency
  onActive: (key: string | null) => void
}) {
  const reduceMotion = useReducedMotion()
  const indice = items.findIndex(i => i.key === active)
  const activeItem = indice >= 0 ? items[indice] : null
  const fill = (i: AllocationItem) => (i.kind === 'fiat' ? `url(#${FIAT_PATTERN})` : i.color)
  return (
    <div className="relative mx-auto" style={{ width: 240, height: 240 }} onMouseLeave={() => onActive(null)}>
      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <defs>
              <pattern id={FIAT_PATTERN} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={NEUTRAL_COLOR} />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
              </pattern>
            </defs>
            {/* key por vista: al cambiar de Activo a Wallet el anillo entra de nuevo. */}
            <Pie key={mode} rootTabIndex={-1} data={items as AllocationItem[]} dataKey="value" nameKey="label" cx="50%" cy="50%"
              innerRadius={RADIO_INT} outerRadius={RADIO_EXT}
              paddingAngle={items.length > 1 ? 2 : 0} cornerRadius={items.length > 1 ? 4 : 0} strokeWidth={0}
              isAnimationActive={!reduceMotion} animationDuration={650} animationEasing="ease-out"
              activeIndex={indice >= 0 ? indice : undefined} activeShape={SegmentoActivo}
              onMouseEnter={(_, index) => onActive(items[index]?.key ?? null)}>
              {items.map(i => (
                <Cell key={i.key} fill={fill(i)} opacity={active && active !== i.key ? 0.3 : 1}
                  style={{ transition: 'opacity 0.2s', outline: 'none', cursor: 'default' }} />
              ))}
            </Pie>
          </RPieChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center" aria-live="polite">
        {activeItem ? (
          <>
            <p className="text-xs font-semibold text-fg truncate max-w-28">{activeItem.label}</p>
            <p className="text-2xl font-semibold mono text-fg leading-tight">{formatPercent(activeItem.pct, 1)}</p>
            <p className="text-xs mono text-fg-subtle">{formatMoney(activeItem.value, currency)}</p>
          </>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-widest text-fg-subtle">Total</p>
            <p className="text-lg font-semibold mono text-fg leading-tight">{formatMoney(total, currency)}</p>
            <p className="text-xs text-fg-subtle">{items.length} {mode === 'asset' ? (items.length === 1 ? 'elemento' : 'elementos') : (items.length === 1 ? 'wallet' : 'wallets')}</p>
          </>
        )}
      </div>
    </div>
  )
}
