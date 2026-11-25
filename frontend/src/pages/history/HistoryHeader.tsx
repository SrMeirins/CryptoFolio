import type { ReactNode } from 'react'
import { Download, Plus } from 'lucide-react'
import type { TransactionFlows } from '../../api/portfolio'
import { PageHeader, Skeleton, buttonClasses, Hint, TextTooltip } from '../../components/ui'
import { navIcon } from '../../constants/navigation'
import { formatMoney, formatNumber, type Currency } from '../../utils/format'
import { formatBalance } from './balance/balanceFormat'

/**
 * Cabecera del Historial: título con recuento y flujos de lo filtrado (#346).
 * Acciones con la cabecera común (#491, #552): «Exportar» con el número de
 * operaciones que se exportarán (CSV de todo lo filtrado), «Nueva operación»
 * y el menú «Más». Las vistas guardadas van en pestañas bajo la cabecera.
 */
export function HistoryHeader({ loaded, total, filtered, flows, currency, menu, onExport, onNew, currentBalance }: {
  loaded: boolean
  total: number
  filtered: boolean
  flows: TransactionFlows['EUR'] | null
  currency: Currency
  /** Menú «Más» (#552). */
  menu: ReactNode
  onExport: () => void
  onNew: () => void
  /** Saldo actual del activo filtrado (#380); de la wallet si se filtra una. */
  currentBalance?: { amount: number; asset: string; wallet: boolean } | null
}) {
  const subtitle = !loaded ? <Skeleton className="inline-block h-3.5 w-40 align-middle" />
    : total > 0 ? `${formatNumber(total, 0)} transacciones${filtered ? ' filtradas' : ''}`
      : filtered ? 'Sin resultados para estos filtros' : 'Sin transacciones importadas'
  return (
    <PageHeader
      icon={navIcon('/history')}
      title="Historial"
      subtitle={<>
        {subtitle}
        {/* En móvil, los flujos en su propia línea, sin el punto delante (#552). */}
        {filtered && flows && (flows.entradas > 0 || flows.salidas > 0) && (
          <span className="block sm:inline sm:ml-2 mono"><TextTooltip label="Entradas y salidas" tip="Suma del valor de las operaciones de entrada y de salida; no incluye movimientos entre tus wallets">
            {flows.entradas > 0 && <><span aria-hidden="true" className="hidden sm:inline"> · </span><span className="text-positive font-semibold">+{formatMoney(flows.entradas, currency)}</span> entradas</>}
            {flows.salidas > 0 && <>{flows.entradas > 0 ? ' · ' : <span aria-hidden="true" className="hidden sm:inline"> · </span>}<span className="text-negative font-semibold">−{formatMoney(flows.salidas, currency)}</span> salidas</>}
          </TextTooltip></span>
        )}
        {currentBalance && (
          <span className="ml-2"> · Saldo actual{currentBalance.wallet ? ' en la wallet' : ''}: <span className="mono font-semibold text-fg">{formatBalance(currentBalance.amount, currentBalance.asset)}</span></span>
        )}
      </>}
      actions={<>
        <Hint label={total > 0 ? `Descarga en CSV las ${formatNumber(total, 0)} transacciones${filtered ? ' filtradas' : ''}` : 'No hay transacciones que exportar'}>
          <button type="button" onClick={onExport} disabled={total === 0}
            aria-label={`Exportar a CSV ${formatNumber(total, 0)} transacciones`}
            className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
            <Download size={13} aria-hidden="true" /><span className="max-sm:sr-only">Exportar</span>{total > 0 && <span className="mono text-fg-subtle max-sm:hidden">({formatNumber(total, 0)})</span>}
          </button>
        </Hint>
        <button type="button" onClick={onNew} className={buttonClasses('primary', 'sm', 'flex gap-1.5 max-sm:flex-1')}>
          <Plus size={14} aria-hidden="true" /> Nueva operación
        </button>
        {menu}
      </>}
    />
  )
}
