import { useMemo, useState } from 'react'
import { PieChart as RPieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { ChevronDown, PieChart, AlertTriangle } from 'lucide-react'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { formatMoney, formatPercent } from '../../utils/format'
import { NEUTRAL_COLOR, allocationByAsset, allocationByWallet, assetColors, concentration, type AllocationItem, type AllocationMode } from '../../utils/allocation'
import { allocationSubtitle } from '../../utils/panelSubtitles'
import { CryptoIcon } from '../../components/CryptoIcon'
import { PanelHeader, SegmentedControl, badgeClasses, panelSurface, Hint, NotApplicable } from '../../components/ui'

// Distribución de la cartera (#235): anillo interactivo con el total en el
// centro y lista con icono, peso, valor y variación 24 h. Se puede ver por
// activo o por wallet (con el color de cada wallet), agrupa en «Otros» lo que
// pasa de 8 elementos y avisa si un activo concentra más del 40 %.

const MODE_KEY = 'cflio_allocation_mode'
const readMode = (): AllocationMode => { try { return localStorage.getItem(MODE_KEY) === 'wallet' ? 'wallet' : 'asset' } catch { return 'asset' } }
const FIAT_PATTERN = 'allocation-fiat-pattern'

export function AllocationChart({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const { currency, prices, open24, rate, dustThreshold } = useDisplayMarket()
  const reduceMotion = useReducedMotion()
  const [mode, setMode] = useState<AllocationMode>(readMode)
  const [active, setActive] = useState<string | null>(null)
  // Fila desplegada: «Otros» o una wallet con su desglose por activo (#506).
  const [open, setOpen] = useState<string | null>(null)

  const { assets, totalValue: total } = usePortfolioValuation(lots, fiatBalances)
  const items = useMemo<AllocationItem[]>(
    () => (mode === 'asset'
      ? allocationByAsset(assets, open24)
      : allocationByWallet(lots, fiatBalances, prices, rate ?? 0, undefined, dustThreshold, assetColors(assets))),
    [mode, assets, open24, lots, fiatBalances, prices, rate, dustThreshold],
  )
  const warn = mode === 'asset' ? concentration(items) : null
  // Sin posiciones (#496): el panel no queda en blanco.
  if (total === 0 || items.length === 0) {
    return (
      <div className={panelSurface('none', 'px-5 py-5 h-full')}>
        <PanelHeader icon={PieChart} title="Distribución" className="mb-4" />
        <NotApplicable>Sin posiciones abiertas que repartir.</NotApplicable>
      </div>
    )
  }

  const activeItem = items.find(i => i.key === active) ?? null
  const changeMode = (m: AllocationMode) => { setMode(m); setActive(null); setOpen(null); try { localStorage.setItem(MODE_KEY, m) } catch { /* solo esta sesión */ } }
  const fill = (i: AllocationItem) => (i.kind === 'fiat' ? `url(#${FIAT_PATTERN})` : i.color)

  return (
    <div className={panelSurface('none', 'px-5 py-5 h-full')}>
      <PanelHeader
        icon={PieChart}
        title="Distribución"
        className="mb-4"
        subtitle={allocationSubtitle(items.map(i => ({ name: i.label, value: i.value })), total, mode)}
        actions={<SegmentedControl label="Agrupar la distribución" variant="accent" value={mode} onChange={changeMode}
          options={[{ value: 'asset', label: 'Activo' }, { value: 'wallet', label: 'Wallet' }]} />}
      />

      {warn && (
        <p className={badgeClasses('warning', 'sm', 'mb-3')}>
          <AlertTriangle size={12} aria-hidden="true" /> {warn.label} concentra el {formatPercent(warn.pct, 0)} de la cartera
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[220px_1fr] items-center">
        {/* Anillo */}
        <div className="relative mx-auto" style={{ width: 220, height: 220 }} onMouseLeave={() => setActive(null)}>
          {/* Decorativo para lectores de pantalla (#356): la lista de al lado tiene los mismos datos. */}
          <div aria-hidden="true" className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RPieChart>
              <defs>
                <pattern id={FIAT_PATTERN} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={NEUTRAL_COLOR} />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
                </pattern>
              </defs>
              <Pie rootTabIndex={-1} data={items} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={70} outerRadius={104}
                paddingAngle={items.length > 1 ? 2 : 0} cornerRadius={items.length > 1 ? 4 : 0} strokeWidth={0} isAnimationActive={!reduceMotion} animationDuration={700}
                onMouseEnter={(_, index) => setActive(items[index]?.key ?? null)}>
                {items.map(i => (
                  <Cell key={i.key} fill={fill(i)}
                    opacity={active && active !== i.key ? 0.3 : 1}
                    style={{ transition: 'opacity 0.2s, transform 0.2s', outline: 'none', cursor: 'default' }} />
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
                <p className="text-xs text-fg-subtle">{items.length} {mode === 'asset' ? (items.length === 1 ? 'activo' : 'activos') : (items.length === 1 ? 'wallet' : 'wallets')}</p>
              </>
            )}
          </div>
        </div>

        {/* Lista */}
        <ul className="space-y-0.5" onMouseLeave={() => setActive(null)}>
          {items.map(i => {
            const isOthers = i.kind === 'other'
            const expandable = isOthers || i.breakdown.length > 0
            const isOpen = open === i.key
            const dimmed = active !== null && active !== i.key
            return (
              <li key={i.key}>
                <Hint label={i.label} className="w-full">
                  <button
                    type="button"
                    aria-expanded={expandable ? isOpen : undefined}
                    onClick={() => expandable && setOpen(o => (o === i.key ? null : i.key))}
                    onMouseEnter={() => setActive(i.key)} onFocus={() => setActive(i.key)} onBlur={() => setActive(null)}
                    className={`w-full flex items-center gap-2 sm:gap-3 px-2 py-1.5 rounded-lg text-left transition-[opacity,background-color] duration-200
                      hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${dimmed ? 'opacity-45' : ''} ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {i.kind === 'crypto'
                      ? <CryptoIcon symbol={i.label} size={24} ring={i.color} />
                      : <span aria-hidden="true" className="w-6 h-6 rounded-md shrink-0" style={{ background: i.kind === 'fiat' ? `repeating-linear-gradient(45deg, ${NEUTRAL_COLOR} 0 3px, rgba(255,255,255,0.35) 3px 5px)` : i.color }} />}
                    {/* En pantallas estrechas (#499) el nombre ocupa el hueco y la barra, decorativa, se oculta. */}
                    <span className={`min-w-0 flex-1 sm:flex-none ${mode === 'wallet' ? 'sm:w-40' : 'sm:w-16'} sm:shrink-0 text-[13px] font-semibold text-fg truncate`}>{i.label}</span>
                    <span className="hidden sm:flex flex-1 h-1.5 rounded-full bg-overlay/6 overflow-hidden" aria-hidden="true">
                      {i.breakdown.length > 0
                        // Por wallet: la barra se reparte por activo con los colores de la vista por activo.
                        ? <span className="flex h-full rounded-full overflow-hidden transition-[width] duration-500" style={{ width: `${i.pct}%` }}>
                            {i.breakdown.map(b => <span key={b.key} className="h-full" style={{ width: `${b.pct}%`, background: b.color }} />)}
                          </span>
                        : <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${i.pct}%`, background: i.color }} />}
                    </span>
                    <span className="w-12 text-right text-xs mono text-fg-muted shrink-0">{formatPercent(i.pct, 1)}</span>
                    <span className="w-20 sm:w-24 text-right text-xs mono text-fg shrink-0">{formatMoney(i.value, currency)}</span>
                    <span className={`w-14 text-right text-xs mono shrink-0 ${i.change24h === null ? 'text-fg-subtle' : i.change24h >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {expandable
                        ? <ChevronDown size={14} aria-hidden="true" className={`inline transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        : i.change24h === null ? '' : formatPercent(i.change24h, 1, true)}
                    </span>
                  </button>
                </Hint>
                {!isOthers && isOpen && (
                  <ul aria-label={`Composición de ${i.label}`} className="ml-11 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-3">
                    {i.breakdown.map(b => (
                      <li key={b.key} className="flex items-center gap-3 text-xs py-0.5">
                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: b.color }} />
                        <span className="flex-1 text-fg-muted truncate">{b.label}</span>
                        <span className="mono text-fg-subtle w-12 text-right">{formatPercent(b.pct, 1)}</span>
                        <span className="mono text-fg w-24 text-right">{formatMoney(b.value, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isOthers && isOpen && (
                  <ul className="ml-11 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-3">
                    {i.members.map(m => (
                      <li key={m.label} className="flex items-center gap-3 text-xs py-0.5">
                        <span className="flex-1 text-fg-muted truncate">{m.label}</span>
                        <span className="mono text-fg-subtle w-12 text-right">{formatPercent(m.pct, 1)}</span>
                        <span className="mono text-fg w-24 text-right">{formatMoney(m.value, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
