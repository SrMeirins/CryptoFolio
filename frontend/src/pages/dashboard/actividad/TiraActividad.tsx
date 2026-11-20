import type { HistoryStats } from '../../../api/portfolio'
import { StatStrip, type StatStripCell } from '../../../components/ui'
import { formatMoney, type Currency } from '../../../utils/format'

// Tira de los últimos 90 días de Actividad reciente (#516): las mismas
// tarjetas que el resumen del Historial (Invertido como «Compras», Ventas,
// Ingresos y Comisiones), así que la cifra coincide al llegar; cada celda abre
// el Historial con esa tarjeta y el periodo.

const ops = (n: number) => `${n} ${n === 1 ? 'operación' : 'operaciones'}`

export function TiraActividad({ totals, desde, currency }: { totals: HistoryStats['totals']; desde: string; currency: Currency }) {
  const destino = (tarjeta: string) => `/history?tarjeta=${tarjeta}&desde=${desde}`
  const celdas: StatStripCell[] = [
    { key: 'compras', label: 'Compras', value: formatMoney(totals.invested[currency], currency), sub: `${totals.fiat_buys} ${totals.fiat_buys === 1 ? 'compra' : 'compras'} con euros`, to: destino('invertido'), destination: 'el Historial' },
    { key: 'ventas', label: 'Ventas', value: formatMoney(totals.sold[currency], currency), sub: ops(totals.sells), to: destino('ventas'), destination: 'el Historial' },
    { key: 'ingresos', label: 'Ingresos', value: formatMoney(totals.income[currency], currency), sub: ops(totals.income_ops), to: destino('ingresos'), destination: 'el Historial' },
    { key: 'comisiones', label: 'Comisiones', value: formatMoney(totals.fees[currency], currency), sub: ops(totals.fee_ops), to: destino('comisiones'), destination: 'el Historial' },
  ]
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-widest text-fg-subtle mb-1.5">Últimos 90 días</p>
      <StatStrip cells={celdas} label="Actividad de los últimos 90 días" columnas={2} />
    </div>
  )
}
