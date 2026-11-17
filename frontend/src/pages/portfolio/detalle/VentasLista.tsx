import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { AssetSale } from '../../../api/portfolio'
import { Button } from '../../../components/ui'
import { formatAmount, formatMoney, formatPrice, pnlColor, type Currency } from '../../../utils/format'
import { formatLotDate } from '../../../utils/portfolioLots'
import { dayKey } from '../../../utils/assetPriceChart'

// Ventas y permutas del activo con su resultado (#528), de la más reciente a
// la más antigua: las 10 últimas y «Ver todas». Son las mismas operaciones que
// las marcas de venta del gráfico; al pasar por una fila (o enfocarla) se
// resalta su marca. Toda la fila lleva a la operación en Historial (con
// teclado, el enlace de la fecha).

export const VENTAS_VISIBLES = 10

export function VentasLista({ sales, currency, rate, onResaltar }: {
  sales: readonly AssetSale[]
  currency: Currency
  /** Unidades de la moneda por EUR en vivo; null sin cambio. */
  rate: number | null
  /** Día (AAAA-MM-DD) de la venta resaltada en el gráfico; null al salir. */
  onResaltar: (day: string | null) => void
}) {
  const navigate = useNavigate()
  const [todas, setTodas] = useState(false)
  const ordenadas = useMemo(() => [...sales].sort((a, b) => b.soldAt.localeCompare(a.soldAt)), [sales])
  const visibles = todas ? ordenadas : ordenadas.slice(0, VENTAS_VISIBLES)
  // Importes fiscales en EUR; con otra moneda, al cambio en vivo.
  const fx = currency === 'EUR' ? 1 : rate ?? 1

  if (ordenadas.length === 0) return <p className="text-xs text-fg-subtle">Sin ventas ni permutas de este activo.</p>
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] mono tabular-nums">
          <caption className="sr-only">Ventas y permutas, de la más reciente a la más antigua</caption>
          <thead>
            <tr className="text-fg-subtle font-sans text-[10px] uppercase tracking-wider">
              <th scope="col" className="text-left font-medium py-1 pr-2">Fecha</th>
              <th scope="col" className="text-left font-medium py-1 pr-2">Tipo</th>
              <th scope="col" className="text-right font-medium py-1 pr-2">Cantidad</th>
              <th scope="col" className="text-right font-medium py-1 pr-2">Precio</th>
              <th scope="col" className="text-right font-medium py-1 pr-2">Importe</th>
              <th scope="col" className="text-right font-medium py-1">Resultado</th>
              <th scope="col" className="w-5"><span className="sr-only">Abrir en Historial</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((s, i) => {
              const day = dayKey(s.soldAt)
              return (
                <tr key={s.txId ?? `${s.soldAt}-${i}`} data-testid="venta-fila"
                  onMouseEnter={() => onResaltar(day)} onMouseLeave={() => onResaltar(null)}
                  onFocus={() => onResaltar(day)} onBlur={() => onResaltar(null)}
                  onClick={e => { if (s.txId && !(e.target as HTMLElement).closest('a')) navigate(`/history?tx=${encodeURIComponent(s.txId)}`) }}
                  className={`border-t border-border hover:bg-overlay/4 focus-within:bg-overlay/4 ${s.txId ? 'cursor-pointer' : ''}`}>
                  <td className="py-1.5 pr-2 font-sans whitespace-nowrap">
                    {s.txId
                      ? <Link to={`/history?tx=${encodeURIComponent(s.txId)}`} className="text-fg hover:underline rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                          aria-label={`Ver en Historial la ${s.kind} del ${formatLotDate(s.soldAt)}`}>{formatLotDate(s.soldAt)}</Link>
                      : <span className="text-fg">{formatLotDate(s.soldAt)}</span>}
                  </td>
                  <td className="py-1.5 pr-2 font-sans text-fg-muted">{s.kind === 'venta' ? 'Venta' : 'Permuta'}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatAmount(s.quantity)}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap text-fg-muted">{formatPrice(s.priceEur * fx, currency)}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap text-fg-muted">{formatMoney(s.proceedsEur * fx, currency)}</td>
                  <td className={`py-1.5 text-right whitespace-nowrap font-semibold ${pnlColor(s.gainLossEur)}`}>
                    {s.gainLossEur >= 0 ? '+' : ''}{formatMoney(s.gainLossEur * fx, currency)}
                    <span className="sr-only">{s.gainLossEur >= 0 ? ' (ganancia)' : ' (pérdida)'}</span>
                  </td>
                  <td className="py-1.5 pl-1 text-fg-subtle">{s.txId && <ChevronRight size={12} aria-hidden="true" />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {ordenadas.length > VENTAS_VISIBLES && (
        <Button variant="ghost" size="sm" onClick={() => setTodas(t => !t)} aria-expanded={todas}>
          {todas ? `Ver solo las ${VENTAS_VISIBLES} últimas` : `Ver todas (${ordenadas.length})`}
        </Button>
      )}
      {currency !== 'EUR' && <p className="text-[11px] text-fg-subtle">Importes fiscales en EUR, aquí al cambio actual.</p>}
    </div>
  )
}
