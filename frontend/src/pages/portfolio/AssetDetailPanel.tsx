import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, type LockedAmount } from '../../api/portfolio'
import { Drawer, Skeleton, SkeletonGroup, NotApplicable, QueryError } from '../../components/ui'
import { InfoTooltip } from '../../components/InfoTooltip'
import { type Currency } from '../../utils/format'
import { usePricesStore } from '../../store/pricesStore'
import { AssetPriceChart } from './AssetPriceChart'
import type { CryptoRow } from '../../utils/assetTable'
import { lotsView, unirTrozos } from '../../utils/portfolioLots'
import { DetalleCabecera } from './detalle/DetalleCabecera'
import { DetalleResumen } from './detalle/DetalleResumen'
import { RepartoWallets } from './detalle/RepartoWallets'
import { ReglaPrecios } from './detalle/ReglaPrecios'
import { SiVendo } from './detalle/SiVendo'
import { LotesPorMes } from './detalle/LotesPorMes'
import { VentasLista } from './detalle/VentasLista'

// Panel de detalle de un activo en Portfolio (#272, ampliado en #528):
// gráfico con toda la historia (compras abiertas, compras vendidas y ventas),
// resumen en tira, reparto por wallet, lotes FIFO (escalera de precios, «Si
// vendo X» y grupos por mes), ventas con su resultado, navegación entre
// activos con [ y ] y accesos a Historial y Fiscal.

const NO_IDS: ReadonlySet<string> = new Set()

function Seccion({ id, title, children, extra }: { id: string; title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h3 id={id} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

export function AssetDetailPanel(props: {
  row: CryptoRow
  /** Precio en la moneda de visualización. */
  price: number
  change24h: number | null
  currency: Currency
  rate: number | null
  locked: LockedAmount[]
  /** Orden de activos de la tabla desde la que se abrió (#528). */
  order: readonly string[]
  onNavigate: (asset: string) => void
  /** Abre el simulador; con cantidad y wallet desde «Si vendo X». */
  onSimulate: (quantity?: number, walletId?: string) => void
  onClose: () => void
}) {
  const { row, price, change24h, currency, order, onNavigate, onClose } = props
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const live = usePricesStore(s => s.prices[row.asset]) !== undefined
  // El contenido se monta de nuevo al cambiar de activo con [ y ]: estado local
  // limpio (lotes que saldrían, grupos abiertos), sin cerrar el panel.
  return (
    <Drawer onClose={onClose} labelledBy={titleId} initialFocusRef={closeRef} size="lg">
      <DetalleCabecera asset={row.asset} titleId={titleId} price={price} change24h={change24h} currency={currency}
        live={live} order={order} onNavigate={onNavigate} onClose={onClose} closeRef={closeRef} />
      <Contenido key={row.asset} {...props} titleId={titleId} />
    </Drawer>
  )
}

function Contenido({ row, price, currency, rate, locked, onSimulate, titleId }: Parameters<typeof AssetDetailPanel>[0] & { titleId: string }) {
  const lotsQ = useQuery({
    queryKey: ['open-lots', row.asset],
    queryFn: () => portfolioApi.getOpenLots(row.asset),
    staleTime: 60_000,
  })
  const { data, isLoading, isError } = lotsQ
  // Los trozos de una misma compra se ven como un lote (#528).
  const lots = useMemo(() => unirTrozos(lotsView(data?.lots ?? [], price, currency, rate)), [data, price, currency, rate])
  const salesQ = useQuery({
    queryKey: ['asset-sales', row.asset],
    queryFn: () => portfolioApi.getAssetSales(row.asset),
    staleTime: 60_000,
  })
  const { data: sales } = salesQ
  const livePriceEur = usePricesStore(s => s.prices[row.asset])
  // Inicio de «Todo»: la primera compra del activo, también de lo ya vendido (#523).
  const firstOpenedAt = useMemo(
    () => sales?.firstAcquiredAt ?? lots.reduce<string | null>((min, l) => (min === null || l.openedAt < min ? l.openedAt : min), null),
    [lots, sales],
  )
  const avg = row.totalQuantity > 0 ? row.totalCostBasis / row.totalQuantity : null
  // Lotes que saldrían con «Si vendo X» y venta señalada en la lista.
  const [saldrian, setSaldrian] = useState<ReadonlySet<string>>(NO_IDS)
  const onLots = useCallback((ids: ReadonlySet<string>) => setSaldrian(prev => (prev.size === 0 && ids.size === 0 ? prev : ids)), [])
  const [ventaDia, setVentaDia] = useState<string | null>(null)
  const nVentas = sales?.sales.length ?? 0

  return (
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Evolución del precio (#284, #528) */}
        <section aria-label="Evolución del precio">
          <AssetPriceChart asset={row.asset} currency={currency} rate={rate} livePriceEur={livePriceEur}
            avgPrice={avg} buys={lots} sales={sales?.sales ?? []} closedBuys={sales?.closedBuys}
            firstOpenedAt={firstOpenedAt} highlightDay={ventaDia} />
        </section>

        <Seccion id={`${titleId}-resumen`} title="Resumen">
          <DetalleResumen row={row} price={price} currency={currency} rate={rate} sales={sales} onSimulate={() => onSimulate()} />
        </Seccion>

        <Seccion id={`${titleId}-reparto`} title="Reparto por wallet">
          <RepartoWallets row={row} price={price} currency={currency} locked={locked} />
        </Seccion>

        {salesQ.isError && <QueryError what="las ventas del activo" error={salesQ.error} onRetry={() => void salesQ.refetch()} />}

        <Seccion id={`${titleId}-lotes`} title={`Lotes FIFO abiertos${data ? ` (${lots.length})` : ''}`}
          extra={<InfoTooltip label="Cómo funciona el FIFO global">
            <p>Al vender, sale primero el lote más antiguo del activo, esté en la wallet que esté (FIFO global por activo).</p>
            <p className="mt-1.5">Si vendes desde una wallet un lote que estaba en otra, el lote se reubica: aparece como «Reubicado desde» esa wallet.</p>
            <p className="mt-1.5 text-fg-subtle">Un traspaso entre tus wallets no vende nada: el lote conserva su fecha y su precio de compra.</p>
          </InfoTooltip>}>
          <p className="text-[11px] text-fg-subtle">Se vende primero el lote más antiguo, esté en la wallet que esté (FIFO global); está marcado como «Siguiente».</p>
          {isLoading && <SkeletonGroup label="Cargando los lotes" className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</SkeletonGroup>}
          {isError && <QueryError what="los lotes" error={lotsQ.error} onRetry={() => void lotsQ.refetch()} />}
          {data && lots.length === 0 && <NotApplicable>No hay lotes abiertos.</NotApplicable>}
          {lots.length > 0 && (
            <>
              <ReglaPrecios lots={lots} price={price} avg={avg} asset={row.asset} currency={currency} />
              {data && <SiVendo asset={row.asset} lots={data.lots} onLots={onLots} onSimulate={(q, w) => onSimulate(q, w)} />}
              <LotesPorMes lots={lots} currency={currency} saldrian={saldrian} />
            </>
          )}
        </Seccion>

        <Seccion id={`${titleId}-ventas`} title={`Ventas y permutas${sales ? ` (${nVentas})` : ''}`}>
          {sales && <VentasLista sales={sales.sales} currency={currency} rate={rate} onResaltar={setVentaDia} />}
        </Seccion>
      </div>
  )
}
