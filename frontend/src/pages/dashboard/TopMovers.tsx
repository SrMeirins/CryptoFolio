import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pricesApi } from '../../api/prices'
import { InfoTooltip } from '../../components/InfoTooltip'
import { hoyApp, sumarDias } from '../../utils/rangoGrafico'
import { CryptoIcon } from '../../components/CryptoIcon'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { useFlashOnChange, type FlashDirection } from '../../hooks/useFlashOnChange'
import { heatmapCells, moverData, moversSummary, rankLabels, rankMovers, type MoverItem, type MoversMode } from '../../utils/topMovers'
import { formatMoney, formatPercent, formatPrice } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { T, alpha } from '../../utils/colors'
import { SegmentedControl, PanelHeader, panelSurface, NotApplicable } from '../../components/ui'
import { moversSubtitle } from '../../utils/panelSubtitles'
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { escalaImpacto, PERIODO_METRICA, referenciasHoy, resumenMovimiento, textoContadores, type ResumenMovimiento } from '../../utils/variacionMapa'
import { MoversHeatmap } from './MoversHeatmap'

const signed = (n: number, currency: ReturnType<typeof useCurrency>) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMoney(Math.abs(n), currency)}`

// Fila del ranking (#513): toda la fila enlaza al activo en Portfolio. La barra
// mide su impacto en euros frente al mayor de la cartera y el texto lo pone en
// contexto con el resultado del periodo («Aporta +11 € de +168 € hoy»): así se
// distingue un gran % en una posición pequeña de un % menor que mueve de
// verdad la cartera.
function MoverRow({ asset, pct, value, rank, mode, price, reference, impact, escala, neto }: MoverItem & { mode: MoversMode; escala: number; neto: number }) {
  const currency = useCurrency()
  const pctFlash   = useFlashOnChange(pct)
  const valueFlash = useFlashOnChange(value)
  const isUp  = pct >= 0
  const color = isUp ? T.positive : T.negative
  const flashClass = (f: FlashDirection) => (f === 'up' ? 'flash-up' : f === 'down' ? 'flash-down' : '')

  return (
    <Link to={`/portfolio?activo=${encodeURIComponent(asset)}`}
      aria-label={`${rank}. ${asset}: ${formatPercent(pct, 2, true)}, valor ${formatMoney(value, currency)}. Aporta ${signed(impact, currency)} de ${signed(neto, currency)} ${PERIODO_METRICA[mode]}. Ver ${asset} en Portfolio`}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-overlay/3 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
      <span className="text-xs text-fg-subtle w-3 text-center mono shrink-0">{rank}</span>
      <CryptoIcon symbol={asset} size={32} ring={color} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight text-fg">{asset}</p>
        <p className="text-xs text-fg-subtle mono leading-tight mt-0.5 truncate">
          {mode === 'total'
            ? <>Medio {formatPrice(reference, currency)}, ahora {formatPrice(price, currency)}</>
            : <>{formatPrice(price, currency)}</>}
        </p>
        <div className="mt-1.5" aria-hidden="true">
          <div className="h-1 rounded-full bg-overlay/6 overflow-hidden">
            <span className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ background: impact >= 0 ? T.positive : T.negative, width: `${Math.max(2, escala * 100)}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Aporta <span className={`mono font-semibold ${impact >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>{signed(impact, currency)}</span> de {signed(neto, currency)} {PERIODO_METRICA[mode]}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[13px] font-bold mono px-2 py-0.5 rounded-lg ${flashClass(pctFlash)}`} style={{ background: `${alpha(color, 10)}`, color }}>
          {formatPercent(pct, 2, true)}
        </span>
        <span className="text-xs mono" style={{ color }}>{impact >= 0 ? '+' : '−'}{formatMoney(Math.abs(impact), currency)}</span>
        <span className={`text-[11px] mono text-fg-subtle rounded ${flashClass(valueFlash)}`}>{formatMoney(value, currency)}</span>
      </div>
    </Link>
  )
}

// Preferencia del selector, recordada en este navegador.
const MODE_KEY = 'cryptofolio.topMovers.mode'
const NO_FIAT: FiatBalance[] = []

function readMode(): MoversMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'total' || v === '24h' ? v : 'hoy'
  } catch { return 'hoy' }
}

function saveMode(mode: MoversMode): void {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* almacenamiento no disponible: solo para esta sesión */ }
}

const MODE_LABELS: Record<MoversMode, { short: string; title: string }> = {
  hoy: { short: 'Hoy', title: 'Variación desde las 00:00 (frente al cierre de ayer)' },
  '24h': { short: '24h', title: 'Variación en las últimas 24 horas' },
  total: { short: 'Total', title: 'Rentabilidad desde la compra (precio medio)' },
}

export function TopMovers({ lots, pnlHoy = null }: {
  lots: FifoLot[]
  /** P&L de hoy en vivo (el de la tarjeta), para que «Hoy» cuadre con él; null si aún no hay. */
  pnlHoy?: number | null
}) {
  // Precio de hace 24h y umbral de polvo en la moneda de visualización (#177).
  const { currency, open24, dustThreshold } = useDisplayMarket()
  const { assets } = usePortfolioValuation(lots, NO_FIAT)
  const [mode, setMode] = useState<MoversMode>(readMode)

  // «Hoy» (#513): cierre de ayer de cada activo, precargado aunque la métrica
  // sea otra para que el cambio sea instantáneo.
  const ayer = sumarDias(hoyApp(), -1)
  const simbolos = useMemo(() => [...new Set([...assets.filter(a => a.kind === 'crypto').map(a => a.asset), 'USDT'])].sort(), [assets])
  // consulta de fondo (#498): sin los cierres de ayer, «Hoy» lo dice en el panel y las otras métricas no dependen de ellos.
  const cierresQ = useQuery({
    queryKey: ['price-closes', 2, simbolos.join(','), ayer],
    queryFn: () => pricesApi.getCloses(simbolos, 2),
    enabled: lots.length > 0 && simbolos.length > 1,
    staleTime: 30 * 60_000,
  })
  const refHoy = useMemo(() => referenciasHoy(cierresQ.data?.closes, ayer, currency), [cierresQ.data, ayer, currency])
  const refs = mode === 'hoy' ? refHoy : open24

  const navigate = useNavigate()
  const { top, bottom } = useMemo(() => rankMovers(assets, refs, mode, dustThreshold), [assets, refs, mode, dustThreshold])
  const data = useMemo(() => moverData(assets, refs, mode, dustThreshold), [assets, refs, mode, dustThreshold])
  const cells = useMemo(() => heatmapCells(data), [data])
  const labels = rankLabels(data, top, bottom)
  const summary = moversSummary(data)
  // Barra por impacto en euros y resumen que, en «Hoy», cuadra con el P&L del día de la tarjeta.
  const escala = useMemo(() => escalaImpacto(data), [data])
  const resumen = resumenMovimiento(data, mode === 'hoy' ? pnlHoy : null)
  const contadores = textoContadores(summary.gains, summary.losses, mode)

  // Sin posiciones (#496): el panel no desaparece; dice que no aplica.
  if (lots.length === 0) {
    return (
      <div className={panelSurface('none', 'overflow-hidden')}>
        <PanelHeader icon={Activity} title="Variación" className="px-5 py-4 border-b border-border" />
        <NotApplicable>Sin posiciones abiertas que comparar.</NotApplicable>
      </div>
    )
  }

  function changeMode(next: MoversMode) {
    setMode(next)
    saveMode(next)
  }

  const header = (label: string, color: string, glow: string, textClass: string) => (
    <div className="px-5 py-2.5 border-y border-border flex items-center gap-2 bg-overlay/2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} style={{ boxShadow: `0 0 6px ${glow}` }} />
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${textClass}`}>{label}</span>
    </div>
  )

  return (
    <div className={panelSurface('none', 'overflow-hidden')}>
      <PanelHeader
        icon={Activity}
        title="Variación"
        className="px-5 py-4 border-b border-border"
        help={<>
          <p>{MODE_LABELS[mode].title}. «Hoy» compara con el cierre de ayer (como la tarjeta y el calendario); «24h», con el precio de hace 24 horas exactas; «Total», con tu precio medio de compra.</p>
          <p>Bajo el mapa, lo que suman los que suben y los que bajan y el neto del periodo; en «Hoy», el neto es el P&L del día. La barra de cada fila mide su aporte en euros frente al mayor de la cartera.</p>
          <p>Cada casilla del mapa y cada fila del ranking abre el activo en Portfolio; «Otros», sus activos filtrados. Con el teclado, Tab entra en el mapa y las flechas recorren las casillas.</p>
        </>}
        subtitle={moversSubtitle(mode, data.length)}
        actions={<SegmentedControl label="Métrica de mejores y peores" variant="accent" value={mode} onChange={changeMode}
          options={(['hoy', '24h', 'total'] as const).map(m => ({ value: m, label: MODE_LABELS[m].short }))} />}
      />

      {top.length === 0 ? (
        <NotApplicable>
          {mode === 'hoy'
            ? cierresQ.isLoading ? 'Cargando el cierre de ayer de cada activo…' : 'Aún no hay cierres de ayer para comparar. Prueba con «24h».'
            : mode === '24h'
            ? 'Aún no hay precios de hace 24h. Aparecerán en cuanto lleguen del feed en vivo.'
            : 'No hay activos con valor suficiente para comparar.'}
        </NotApplicable>
      ) : (
        <>
        <div className="px-5 pt-4 pb-4 space-y-3">
          <MoversHeatmap cells={cells} mode={mode} currency={currency} onOpen={href => navigate(href)}
            contadores={<>
              <span className={`inline-flex items-center gap-1 font-semibold ${contadores.down === null && summary.gains === 0 ? 'text-negative-ink' : 'text-positive-ink'}`}>
                {contadores.down === null && summary.gains === 0 ? <TrendingDown size={14} aria-hidden="true" /> : <TrendingUp size={14} aria-hidden="true" />}
                {contadores.up}
              </span>
              {contadores.down !== null && (
                <span className="inline-flex items-center gap-1 font-semibold text-negative-ink">
                  <TrendingDown size={14} aria-hidden="true" />{contadores.down}
                </span>
              )}
            </>} />
          <ResumenFila resumen={resumen} mode={mode} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border">
          <div>
            {header(labels.first, 'bg-positive', T.positive, 'text-positive-ink')}
            <div className="divide-y divide-border/30">
              {top.map(item => <MoverRow key={`${item.asset}-${currency}`} {...item} mode={mode} escala={escala.get(item.asset) ?? 0} neto={resumen.neto} />)}
            </div>
          </div>
          <div>
            {header(labels.second, 'bg-negative', T.negative, 'text-negative-ink')}
            <div className="divide-y divide-border/30">
              {bottom.map(item => <MoverRow key={`${item.asset}-${currency}`} {...item} mode={mode} escala={escala.get(item.asset) ?? 0} neto={resumen.neto} />)}
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  )
}

/** Resumen bajo el mapa (#513): lo que suman los que suben y los que bajan, otros efectos (en «Hoy») y el neto. */
function ResumenFila({ resumen, mode }: { resumen: ResumenMovimiento; mode: MoversMode }) {
  const currency = useCurrency()
  const tono = (n: number) => (n > 0 ? 'text-positive-ink' : n < 0 ? 'text-negative-ink' : 'text-fg-muted')
  const titulo = mode === 'hoy' ? 'Hoy' : mode === '24h' ? 'En 24 h' : 'Desde la compra'
  return (
    <p data-testid="resumen-variacion" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
      <span className="font-semibold text-fg">{titulo}:</span>
      <span>suben <span className={`mono font-semibold ${tono(resumen.suben)}`}>{signed(resumen.suben, currency)}</span></span>
      <span>bajan <span className={`mono font-semibold ${tono(resumen.bajan)}`}>{signed(resumen.bajan, currency)}</span></span>
      {resumen.otros !== null && Math.abs(resumen.otros) >= 0.01 && (
        <span className="inline-flex items-center gap-1">otros efectos <span className={`mono font-semibold ${tono(resumen.otros)}`}>{signed(resumen.otros, currency)}</span>
          <InfoTooltip label="Qué son los otros efectos">
            <p>Lo que mueve el resultado de hoy y no se explica por el precio de los activos del mapa: compras, ventas y permutas de hoy a un precio distinto del cierre de ayer, posiciones de polvo, monedas estables y activos sin cierre de ayer.</p>
          </InfoTooltip>
        </span>
      )}
      <span>neto <span className={`mono font-semibold ${tono(resumen.neto)}`}>{signed(resumen.neto, currency)}</span>{mode === 'hoy' ? ' (el de la tarjeta)' : ''}</span>
    </p>
  )
}
