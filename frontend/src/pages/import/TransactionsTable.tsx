import { Eye, ChevronUp, ChevronDown } from 'lucide-react'
import { OP_META } from '../../constants/operations'
import { AccountChip } from './AccountChip'
import { ACCOUNT_COLORS } from './types'
import type { PreviewTransaction } from './types'

export function TransactionsTable({ newCount, newTxs, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize }: {
  newCount: number
  newTxs: PreviewTransaction[]
  showTxTable: boolean
  setShowTxTable: (v: boolean) => void
  txPage: number
  setTxPage: (v: number) => void
  txPageSize: number
}) {
  const paginated  = newTxs.slice(txPage * txPageSize, (txPage + 1) * txPageSize)
  const totalPages = Math.ceil(newTxs.length / txPageSize)

  return (
    <div className="card p-0">
      <button
        type="button"
        onClick={() => setShowTxTable(!showTxTable)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-gray-500" />
          <span className="font-medium text-sm">Ver {newCount} transacciones nuevas</span>
        </div>
        {showTxTable ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {showTxTable && (
        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-2.5">Fecha</th>
                  <th className="text-left px-4 py-2.5">Cuenta</th>
                  <th className="text-left px-4 py-2.5">Tipo</th>
                  <th className="text-left px-4 py-2.5">Activo</th>
                  <th className="text-right px-4 py-2.5">Cantidad</th>
                  <th className="text-right px-4 py-2.5">Coste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((tx, i) => {
                  const meta = OP_META[tx.operationType] ?? { label: tx.operationType, color: '#9ca3af' }
                  return (
                    <tr key={i} className="hover:bg-background-tertiary/50">
                      <td className="px-4 py-2.5 text-gray-400 mono">
                        {new Date(tx.timestamp).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-2.5">
                        <AccountChip account={tx.account} colors={ACCOUNT_COLORS} />
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: meta.color }}>
                        {meta.label}
                      </td>
                      <td className="px-4 py-2.5 mono font-medium">{tx.asset}</td>
                      <td className="px-4 py-2.5 text-right mono">{tx.amountNet.toFixed(4)}</td>
                      <td className="px-4 py-2.5 text-right mono text-gray-400">
                        {tx.costAmount ? `${tx.costAmount.toFixed(2)} ${tx.costAsset}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <button
                type="button"
                onClick={() => setTxPage(Math.max(0, txPage - 1))}
                disabled={txPage === 0}
                className="text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
              >
                Anterior
              </button>
              <span className="text-xs text-gray-500">{txPage + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setTxPage(Math.min(totalPages - 1, txPage + 1))}
                disabled={txPage === totalPages - 1}
                className="text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
