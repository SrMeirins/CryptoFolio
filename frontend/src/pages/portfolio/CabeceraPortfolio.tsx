import { useMemo } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { FiatBalance, FifoLot } from '../../api/portfolio'
import { StatStrip, type StatStripCell } from '../../components/ui'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import { localToday } from '../../utils/pnlChart'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { computeChange24h } from '../../utils/change24h'
import { formatMoney, formatPercent } from '../../utils/format'
import { custodiaPartes, partirImporte, recuperarCoste, trazoMini } from '../../utils/portfolioCabecera'
import type { Inventory } from '../../utils/portfolioInventory'
import type { PnlFilter } from '../../utils/portfolioView'
import { CustodyRing } from './CustodyRing'

// Cabecera de Portfolio (#525): una tarjeta con el valor de la cartera en
// grande (decimales más pequeños), chips de coste y cambio en 24 h (misma
// valoración que el Dashboard) y un mini gráfico del valor de los últimos 7
// días con el de ahora al final; debajo, una tira con lo
// que no está en el subtítulo: P&L no realizado (filtra la tabla), cuánto
// falta para recuperar el coste, la mayor posición (abre su detalle; aviso
// por encima del umbral de Ajustes), la custodia sin redondear a 100 % y lo
// bloqueado, solo si lo hay.

const SIGUIENTE: Record<PnlFilter, PnlFilter> = { all: 'gain', gain: 'loss', loss: 'all' }
const TEXTO_FILTRO: Record<PnlFilter, string> = { all: 'todas las posiciones', gain: 'solo las que ganan', loss: 'solo las que pierden' }

export function CabeceraPortfolio({ lots, fiatBalances, inventory, pnlFilter, onPnlFilter, onDetalle, umbralConcentracion }: {
  lots: FifoLot[]
  fiatBalances: FiatBalance[]
  inventory: Inventory
  pnlFilter: PnlFilter
  onPnlFilter: (f: PnlFilter) => void
  onDetalle: (asset: string) => void
  umbralConcentracion: number
}) {
  const currency = useCurrency()
  const money = (v: number) => formatMoney(v, currency)
  const { open24, fiatOpen24 } = useDisplayMarket()
  const v = usePortfolioValuation(lots, fiatBalances)
  const cambio = useMemo(() => computeChange24h(v.assets, open24, fiatOpen24), [v.assets, open24, fiatOpen24])

  // Valor al cierre de los últimos 7 días (misma serie que la evolución del Dashboard) y el de ahora.
  // consulta de fondo (#498): el mini gráfico es decorativo; si falla, no se dibuja y el resto sigue.
  const desde = useMemo(() => { const d = new Date(`${localToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10) }, [])
  const semanaQ = useCurrencyQuery(c => dailyPnlQuery(c, desde, undefined), { refetchInterval: 300_000 })
  const semana = useMemo(() => [...(semanaQ.data?.days ?? []).map(d => d.value), v.totalValue], [semanaQ.data, v.totalValue])
  const trazo = trazoMini(semana, 160, 48)
  const cambioSemana = semana.length >= 2 && semana[0] > 0 ? ((semana[semana.length - 1] - semana[0]) / semana[0]) * 100 : null
  const valor = partirImporte(money(v.totalValue))

  const pnlPct = v.totalCost > 0 ? (v.pnl / v.totalCost) * 100 : null
  const recuperar = recuperarCoste(v.cryptoValue, v.totalCost)
  const top = inventory.positions.top
  const concentrada = !!top && top.pct > umbralConcentracion
  const custodia = custodiaPartes(inventory.custody.self, inventory.custody.exchange)

  const celdas: StatStripCell[] = [
    {
      key: 'pnl', label: 'P&L no realizado', value: v.pnl, format: x => `${x > 0 ? '+' : ''}${money(x)}`,
      tone: v.pnl > 0.005 ? 'positive' : v.pnl < -0.005 ? 'negative' : undefined,
      sub: <>{pnlPct !== null ? `${formatPercent(pnlPct, 1, true)} sobre el coste` : 'sin coste'}{pnlFilter !== 'all' ? `. Tabla: ${TEXTO_FILTRO[pnlFilter]}` : ''}</>,
      onSelect: () => onPnlFilter(SIGUIENTE[pnlFilter]), destination: `la tabla (${TEXTO_FILTRO[SIGUIENTE[pnlFilter]]})`,
    },
    recuperar.estado === 'perdida' ? {
      key: 'recuperar', label: 'Para recuperar el coste',
      value: Number.isFinite(recuperar.subidaPct) ? `subir ${formatPercent(recuperar.subidaPct, 1)}` : 'sin valor',
      sub: `faltan ${money(recuperar.faltan)}`, tone: 'warning',
    } : recuperar.estado === 'ganancia' ? {
      key: 'recuperar', label: 'Para recuperar el coste', value: 'Ya lo superas',
      sub: `${formatPercent(recuperar.margenPct, 1, true)} sobre el coste`, tone: 'positive',
    } : { key: 'recuperar', label: 'Para recuperar el coste', value: 'Sin coste', sub: 'nada que recuperar' },
    top ? {
      key: 'mayor', label: 'Mayor posición', value: <span className="truncate">{top.asset} {formatPercent(top.pct, 1)}</span>,
      sub: concentrada ? `más del ${umbralConcentracion} % de la cartera` : 'de la cartera',
      tone: concentrada ? 'warning' : undefined,
      onSelect: () => onDetalle(top.asset), destination: `el detalle de ${top.asset}`,
    } : { key: 'mayor', label: 'Mayor posición', value: 'Sin precios', sub: 'para calcular el peso' },
    {
      key: 'custodia', label: 'Custodia',
      value: <span className="flex items-center gap-1.5 min-w-0"><CustodyRing selfPct={(inventory.custody.self / Math.max(inventory.total, 1e-9)) * 100} />
        <span className="truncate">{custodia.todo === 'propia' ? 'Todo propia' : custodia.todo === 'exchanges' ? 'Todo en exchanges' : `${custodia.propia} % propia`}</span></span>,
      sub: custodia.todo ? (custodia.todo === 'propia' ? 'en autocustodia' : 'custodia de terceros') : `${custodia.exchanges} % en exchanges`,
    },
  ]
  if (inventory.locked.assets > 0) {
    celdas.push({
      key: 'bloqueado', label: 'Bloqueado', value: inventory.locked.value, format: money,
      sub: `${inventory.locked.assets} ${inventory.locked.assets === 1 ? 'activo' : 'activos'} en staking`,
    })
  }

  return (
    <section aria-label="Resumen de la cartera" className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-linear-to-br from-brand/10 via-background-card to-background-card px-5 py-4 flex items-center gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] uppercase tracking-widest text-fg-subtle">Valor de la cartera</p>
          <p className="mt-1 mono tabular-nums text-fg font-bold leading-none" aria-label={`Valor de la cartera: ${money(v.totalValue)}`}>
            <span className="text-4xl">{valor.entero}</span><span className="text-xl text-fg-muted">{valor.resto}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-card/70 px-2.5 py-1 text-fg-muted">
              Coste <span className="mono text-fg">{money(v.totalCost)}</span>
            </span>
            {cambio.status === 'ok' ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${cambio.eur > 0.005 ? 'border-positive/30 bg-positive/10 text-positive' : cambio.eur < -0.005 ? 'border-negative/30 bg-negative/10 text-negative' : 'border-border text-fg-muted'}`}>
                {cambio.eur > 0.005 ? <TrendingUp size={12} aria-hidden="true" /> : cambio.eur < -0.005 ? <TrendingDown size={12} aria-hidden="true" /> : null}
                24 h <span className="mono">{cambio.eur > 0 ? '+' : ''}{money(cambio.eur)} ({formatPercent(cambio.pct, 1, true)})</span>
                {cambio.excluded.length > 0 && <span className="text-fg-subtle">sin {cambio.excluded.join(', ')}</span>}
              </span>
            ) : <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-fg-subtle">24 h: esperando precios</span>}
          </div>
        </div>
        {trazo && (
          <figure className="shrink-0 text-right">
            <svg viewBox="0 0 160 48" className="w-40 h-12" aria-hidden="true">
              <defs>
                <linearGradient id="cabecera-semana" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--cf-brand-solid)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--cf-brand-solid)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={trazo.area} fill="url(#cabecera-semana)" />
              <path d={trazo.linea} fill="none" stroke="var(--cf-brand-solid)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <figcaption className="text-[11px] text-fg-subtle">
              7 días{cambioSemana !== null && <> <span className={`mono ${cambioSemana > 0.005 ? 'text-positive' : cambioSemana < -0.005 ? 'text-negative' : 'text-fg-muted'}`}>{formatPercent(cambioSemana, 1, true)}</span></>}
            </figcaption>
          </figure>
        )}
      </div>
      <StatStrip label="Métricas de la cartera" cells={celdas} />
    </section>
  )
}
