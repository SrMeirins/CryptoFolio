import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import type { TransactionFlows } from '../../api/portfolio'
import { PageHeader, buttonClasses } from '../../components/ui'
import { navIcon } from '../../constants/navigation'
import { formatMoney, formatNumber, type Currency } from '../../utils/format'
import { formatBalance } from './balance/balanceFormat'

/**
 * Cabecera del Historial: título con recuento y flujos de lo filtrado (#346),
 * y acciones (vistas guardadas, CSV de todo lo filtrado y nueva transacción).
 */
export function HistoryHeader({ loaded, total, filtered, flows, currency, views, onExport, onNew, currentBalance }: {
  loaded: boolean
  total: number
  filtered: boolean
  flows: TransactionFlows['EUR'] | null
  currency: Currency
  /** Desplegable de vistas guardadas (#369). */
  views: ReactNode
  onExport: () => void
  onNew: () => void
  /** Saldo actual del activo filtrado (#380); de la wallet si se filtra una. */
  currentBalance?: { amount: number; asset: string; wallet: boolean } | null
}) {
  const subtitle = !loaded ? 'Cargando…'
    : total > 0 ? `${formatNumber(total, 0)} transacciones${filtered ? ' filtradas' : ''}`
      : filtered ? 'Sin resultados para estos filtros' : 'Sin transacciones importadas'
  return (
    <PageHeader
      icon={navIcon('/history')}
      title="Historial"
      subtitle={<>
        {subtitle}
        {filtered && flows && (flows.entradas > 0 || flows.salidas > 0) && (
          <span className="ml-2 mono" title="Suma del valor de las operaciones de entrada y de salida; no incluye movimientos entre tus wallets">
            {flows.entradas > 0 && <> · <span className="text-positive font-semibold">+{formatMoney(flows.entradas, currency)}</span> entradas</>}
            {flows.salidas > 0 && <> · <span className="text-negative font-semibold">−{formatMoney(flows.salidas, currency)}</span> salidas</>}
          </span>
        )}
        {currentBalance && (
          <span className="ml-2"> · Saldo actual{currentBalance.wallet ? ' en la wallet' : ''}: <span className="mono font-semibold text-fg">{formatBalance(currentBalance.amount, currentBalance.asset)}</span></span>
        )}
      </>}
      actions={<>
        {views}
        <button type="button" onClick={onExport} disabled={total === 0}
          title={total > 0 ? `Exporta las ${formatNumber(total, 0)} transacciones${filtered ? ' filtradas' : ''}` : 'No hay transacciones que exportar'}
          aria-label={`Exportar a CSV ${formatNumber(total, 0)} transacciones`}
          className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
          <Download size={13} aria-hidden="true" /> CSV{total > 0 && <span className="mono text-fg-subtle">({formatNumber(total, 0)})</span>}
        </button>
        <button type="button" onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/15 border border-brand/30 rounded-lg text-xs text-brand-ink hover:bg-brand/25 transition-colors font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          + Nueva
        </button>
      </>}
    />
  )
}
