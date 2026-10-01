import { useState } from 'react'
import {
  Trash2, AlertTriangle, PenLine, ChevronDown, ChevronUp, X, RefreshCw, ArrowRight,
} from 'lucide-react'
import type { Transaction } from '../../api/portfolio'
import { CopyButton } from '../../components/CopyButton'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatEur, formatPrice, formatAmount } from '../../utils/format'
import { OP_META } from '../../constants/operations'
import { fmtDate, calcEurValue, calcFeeEur, formatPriceLine } from './helpers'

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-amber/30 text-white rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function OpChip({ type }: { type: string }) {
  const meta = OP_META[type] ?? { label: type, color: '#6b7280' }
  return (
    <span
      className="inline-flex items-center font-semibold rounded-md text-[10px] px-1.5 py-0.5 whitespace-nowrap shrink-0"
      style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

export function TxRow({
  tx, onDelete, onEdit, isDeleting, searchTerm,
}: {
  tx: Transaction
  onDelete: (id: string) => void
  onEdit:   (tx: Transaction) => void
  isDeleting: boolean
  searchTerm: string
}) {
  const [expanded, setExpanded]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meta   = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: '#6b7280', group: 'other', rowBg: 'transparent' }
  const isBuy  = meta.group === 'buy' || meta.group === 'income'
  const isSell = meta.group === 'sell'

  const { date, time } = fmtDate(tx.timestamp)
  const eurValue = calcEurValue(tx)
  const feeEur   = calcFeeEur(tx)
  const priceLine = formatPriceLine(tx)

  const hasCost  = tx.cost_asset && tx.cost_amount && parseFloat(tx.cost_amount) !== 0

  return (
    <>
      <tr
        className={`group border-b border-border/40 transition-colors cursor-pointer ${expanded ? 'bg-background-tertiary/50' : ''}`}
        style={{ backgroundColor: expanded ? undefined : meta.rowBg }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Fecha */}
        <td className="px-4 py-2.5 whitespace-nowrap align-middle">
          <div className="text-[11px] font-medium text-gray-300">{date}</div>
          <div className="text-[10px] text-gray-600 mono">{time}</div>
        </td>

        {/* Tipo */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-1.5">
            <OpChip type={tx.operation_type} />
            {tx.manually_added && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-accent-blue/15 text-accent-blue font-bold shrink-0">M</span>
            )}
          </div>
        </td>

        {/* Activo + cantidad */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-2 min-w-0">
            <CryptoIcon symbol={tx.asset} size={26} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold mono text-sm text-white">
                  <Highlight text={tx.asset} query={searchTerm} />
                </span>
                <span className={`text-xs mono font-semibold ${isBuy ? 'text-accent-green' : isSell ? 'text-accent-red' : 'text-gray-300'}`}>
                  {isBuy ? '+' : isSell ? '−' : ''}{formatAmount(tx.amount_net, 6)}
                </span>
              </div>
              {tx.notes && (
                <p className="text-[10px] text-gray-600 truncate max-w-[200px] leading-tight mt-0.5">{tx.notes}</p>
              )}
            </div>
          </div>
        </td>

        {/* Valor EUR */}
        <td className="px-3 py-2.5 text-right align-middle">
          {eurValue != null ? (
            <>
              <div className="text-sm mono font-semibold text-white">{formatPrice(eurValue)}</div>
              {priceLine && <div className="text-[10px] text-gray-600 mono mt-0.5">@ {priceLine}</div>}
            </>
          ) : hasCost ? (
            <>
              <div className="text-xs mono text-gray-400">{formatAmount(tx.cost_amount, 4)}</div>
              <div className="text-[10px] text-gray-600">{tx.cost_asset}</div>
            </>
          ) : (
            <span className="text-gray-700 text-xs">—</span>
          )}
        </td>

        {/* Fee */}
        <td className="px-3 py-2.5 align-middle">
          {tx.fee_asset && tx.fee_amount ? (
            <div className="flex items-center gap-1.5">
              <CryptoIcon symbol={tx.fee_asset} size={14} />
              <div>
                <div className="text-xs mono text-gray-400">
                  {formatAmount(tx.fee_amount, 6)} <span className="text-gray-600 text-[10px]">{tx.fee_asset}</span>
                </div>
                {feeEur != null && <div className="text-[10px] text-gray-600 mono">{formatEur(feeEur)}</div>}
              </div>
            </div>
          ) : (
            <span className="text-gray-700 text-xs">—</span>
          )}
        </td>

        {/* Wallet */}
        <td className="px-3 py-2.5 align-middle">
          {tx.operation_type === 'TRANSFER_INTERNAL' && tx.destination_wallet_name ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}>
                {tx.wallet_name}
              </span>
              <ArrowRight size={10} className="text-gray-600 shrink-0" />
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{ backgroundColor: `${tx.destination_wallet_color}18`, color: tx.destination_wallet_color ?? '#6b7280' }}>
                {tx.destination_wallet_name}
              </span>
            </div>
          ) : (
            <>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}>
                {tx.wallet_name}
              </span>
              {tx.account && <div className="text-[10px] text-gray-600 mt-0.5">{tx.account}</div>}
            </>
          )}
        </td>

        {/* Acciones */}
        <td className="px-3 py-2.5 align-middle" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5">
            {!confirmDelete && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                <button type="button" onClick={() => onEdit(tx)}
                  className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-gray-600 hover:text-accent-blue transition-colors"
                  title="Editar transacción" aria-label="Editar transacción">
                  <PenLine size={12} />
                </button>
                {tx.manually_added && (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="p-1.5 rounded-lg hover:bg-accent-red/10 text-gray-600 hover:text-accent-red transition-colors"
                    title="Eliminar transacción" aria-label="Eliminar transacción">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}
            {tx.manually_added && confirmDelete && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">¿Borrar?</span>
                <button type="button" onClick={() => onDelete(tx.id)} disabled={isDeleting} className="text-accent-red p-0.5" aria-label="Confirmar borrado">
                  {isDeleting ? <RefreshCw size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-600 p-0.5" aria-label="Cancelar borrado"><X size={11} /></button>
              </div>
            )}
            <button type="button" onClick={() => setExpanded(e => !e)}
              className="p-1 text-gray-700 hover:text-gray-400 transition-colors" aria-label={expanded ? 'Contraer detalle' : 'Expandir detalle'}>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Fila expandida */}
      {expanded && (
        <tr className="bg-background-tertiary/15">
          <td colSpan={7} className="px-6 py-3 border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">ID</div>
                <div className="mono text-gray-500 text-[10px] break-all flex items-center gap-1">
                  {tx.id}
                  <CopyButton text={tx.id} size={10} title="Copiar ID" className="ml-1" />
                </div>
              </div>
              {tx.price_per_unit && (
                <div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Precio unitario</div>
                  <div className="mono text-gray-300">{parseFloat(tx.price_per_unit).toFixed(8)} {tx.cost_asset ?? 'EUR'}</div>
                </div>
              )}
              {tx.destination_wallet_name && (
                <div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Destino</div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold"
                    style={{ backgroundColor: `${tx.destination_wallet_color}18`, color: tx.destination_wallet_color ?? '#6b7280' }}>
                    {tx.destination_wallet_name}
                  </span>
                </div>
              )}
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Importado</div>
                <div className="text-gray-500 text-[11px]">
                  {new Date(tx.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {tx.manually_added && <span className="ml-1.5 text-accent-blue font-medium">· Manual</span>}
                </div>
              </div>
              {tx.linked_tx_id && tx.linked_tx_timestamp && (
                <div className="col-span-2">
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">
                    {tx.operation_type === 'STAKING_UNLOCK' ? 'Staking purchase vinculado' : 'Staking redemption vinculada'}
                  </div>
                  <div className="text-[11px] text-amber-400/80 font-mono">
                    {new Date(tx.linked_tx_timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {tx.linked_tx_amount ? parseFloat(tx.linked_tx_amount).toFixed(6) : ''} {tx.linked_tx_asset}
                  </div>
                </div>
              )}
              {tx.notes && (
                <div className="col-span-2">
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Notas</div>
                  <div className="text-gray-400">{tx.notes}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
