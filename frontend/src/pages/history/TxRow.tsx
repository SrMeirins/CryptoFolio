import { useState, useEffect, useRef } from 'react'
import {
  Trash2, AlertTriangle, PenLine, ChevronDown, ChevronUp, X, RefreshCw, ArrowRight,
} from 'lucide-react'
import type { Transaction } from '../../api/portfolio'
import { CopyButton } from '../../components/CopyButton'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatMoney, formatPrice, formatAmount, type Currency, formatNumber } from '../../utils/format'
import { OP_META } from '../../constants/operations'
import { fmtDate, calcEurValue, calcFeeEur, formatPriceLine, toDisplayAmount } from './helpers'
import { T, alpha, ink } from '../../utils/colors'
import { iconButtonClasses } from '../../components/ui'

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/30 text-fg rounded-lg px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function OpChip({ type }: { type: string }) {
  const meta = OP_META[type] ?? { label: type, color: T.muted }
  return (
    <span
      className="inline-flex items-center font-semibold rounded-lg text-xs px-1.5 py-0.5 whitespace-nowrap shrink-0"
      style={{ backgroundColor: `${alpha(meta.color, 13)}`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

export function TxRow({
  tx, onDelete, onEdit, isDeleting, searchTerm, currency, defaultExpanded = false,
}: {
  tx: Transaction
  currency: Currency
  /** Abierta y visible al cargar (enlace desde la actividad del Dashboard, #237). */
  defaultExpanded?: boolean
  onDelete: (id: string) => void
  onEdit:   (tx: Transaction) => void
  isDeleting: boolean
  searchTerm: string
}) {
  const [expanded, setExpanded]           = useState(defaultExpanded)
  const rowRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => { if (defaultExpanded) rowRef.current?.scrollIntoView({ block: 'center' }) }, [defaultExpanded])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meta   = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: T.muted, group: 'other', rowBg: 'transparent' }
  const isBuy  = meta.group === 'buy' || meta.group === 'income'
  const isSell = meta.group === 'sell'

  const { date, time } = fmtDate(tx.timestamp)
  // Valor y comisión en la moneda de visualización, con el tipo de la fecha de la operación (#177).
  const eurValue = toDisplayAmount(calcEurValue(tx), tx, currency)
  const feeEur   = toDisplayAmount(calcFeeEur(tx), tx, currency)
  const priceLine = formatPriceLine(tx)

  const hasCost  = tx.cost_asset && tx.cost_amount && parseFloat(tx.cost_amount) !== 0

  return (
    <>
      <tr
        ref={rowRef}
        className={`group border-b border-border/40 transition-colors cursor-pointer ${expanded ? 'bg-background-tertiary/50' : ''}`}
        style={{ backgroundColor: expanded ? undefined : meta.rowBg }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Fecha */}
        <td className="px-4 py-2.5 whitespace-nowrap align-middle">
          <div className="text-xs font-medium text-fg">{date}</div>
          <div className="text-xs text-fg-subtle mono">{time}</div>
        </td>

        {/* Tipo */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-1.5">
            <OpChip type={tx.operation_type} />
            {tx.manually_added && (
              <span className="text-xs px-1 py-0.5 rounded-lg bg-brand/15 text-brand font-bold shrink-0">M</span>
            )}
          </div>
        </td>

        {/* Activo + cantidad */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-2 min-w-0">
            <CryptoIcon symbol={tx.asset} size={26} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold mono text-sm text-fg">
                  <Highlight text={tx.asset} query={searchTerm} />
                </span>
                <span className={`text-xs mono font-semibold ${isBuy ? 'text-positive' : isSell ? 'text-negative' : 'text-fg'}`}>
                  {isBuy ? '+' : isSell ? '−' : ''}{formatAmount(tx.amount_net, 6)}
                </span>
              </div>
              {tx.notes && (
                <p className="text-xs text-fg-subtle truncate max-w-[200px] leading-tight mt-0.5">{tx.notes}</p>
              )}
            </div>
          </div>
        </td>

        {/* Valor en la moneda de visualización */}
        <td className="px-3 py-2.5 text-right align-middle">
          {eurValue != null ? (
            <>
              <div className="text-sm mono font-semibold text-fg">{formatPrice(eurValue, currency)}</div>
              {priceLine && <div className="text-xs text-fg-subtle mono mt-0.5">@ {priceLine}</div>}
            </>
          ) : hasCost ? (
            <>
              <div className="text-xs mono text-fg-muted">{formatAmount(tx.cost_amount, 4)}</div>
              <div className="text-xs text-fg-subtle">{tx.cost_asset}</div>
            </>
          ) : (
            <span className="text-fg-subtle text-xs">—</span>
          )}
        </td>

        {/* Fee */}
        <td className="px-3 py-2.5 align-middle">
          {tx.fee_asset && tx.fee_amount ? (
            <div className="flex items-center gap-1.5">
              <CryptoIcon symbol={tx.fee_asset} size={14} />
              <div>
                <div className="text-xs mono text-fg-muted">
                  {formatAmount(tx.fee_amount, 6)} <span className="text-fg-subtle text-xs">{tx.fee_asset}</span>
                </div>
                {feeEur != null && <div className="text-xs text-fg-subtle mono">{formatMoney(feeEur, currency)}</div>}
              </div>
            </div>
          ) : (
            <span className="text-fg-subtle text-xs">—</span>
          )}
        </td>

        {/* Wallet */}
        <td className="px-3 py-2.5 align-middle">
          {tx.operation_type === 'TRANSFER_INTERNAL' && tx.destination_wallet_name ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                style={{ backgroundColor: `${alpha(tx.wallet_color, 9)}`, color: ink(tx.wallet_color) }}>
                {tx.wallet_name}
              </span>
              <ArrowRight size={10} className="text-fg-subtle shrink-0" />
              <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                style={{ backgroundColor: `${alpha(tx.destination_wallet_color ?? T.muted, 9)}`, color: ink(tx.destination_wallet_color ?? T.muted) }}>
                {tx.destination_wallet_name}
              </span>
            </div>
          ) : (
            <>
              <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                style={{ backgroundColor: `${alpha(tx.wallet_color, 9)}`, color: ink(tx.wallet_color) }}>
                {tx.wallet_name}
              </span>
              {tx.account && <div className="text-xs text-fg-subtle mt-0.5">{tx.account}</div>}
            </>
          )}
        </td>

        {/* Acciones */}
        <td className="px-3 py-2.5 align-middle" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5">
            {!confirmDelete && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                <button type="button" onClick={() => onEdit(tx)}
                  className={iconButtonClasses('md', false, '', 'brand')}
                  title="Editar transacción" aria-label="Editar transacción">
                  <PenLine size={12} />
                </button>
                {tx.manually_added && (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className={iconButtonClasses('md', false, '', 'danger')}
                    title="Eliminar transacción" aria-label="Eliminar transacción">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}
            {tx.manually_added && confirmDelete && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-fg-subtle">¿Borrar?</span>
                <button type="button" onClick={() => onDelete(tx.id)} disabled={isDeleting} className="text-negative p-0.5" aria-label="Confirmar borrado">
                  {isDeleting ? <RefreshCw size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={iconButtonClasses('sm')} aria-label="Cancelar borrado"><X size={11} /></button>
              </div>
            )}
            <button type="button" onClick={() => setExpanded(e => !e)}
              className="p-1 text-fg-subtle hover:text-fg-muted transition-colors" aria-label={expanded ? 'Contraer detalle' : 'Expandir detalle'}>
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
                <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">ID</div>
                <div className="mono text-fg-subtle text-xs break-all flex items-center gap-1">
                  {tx.id}
                  <CopyButton text={tx.id} size={10} title="Copiar ID" className="ml-1" />
                </div>
              </div>
              {tx.price_per_unit && (
                <div>
                  <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">Precio unitario</div>
                  <div className="mono text-fg">{formatNumber(parseFloat(tx.price_per_unit), 8, 8)} {tx.cost_asset ?? 'EUR'}</div>
                </div>
              )}
              {tx.destination_wallet_name && (
                <div>
                  <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">Destino</div>
                  <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                    style={{ backgroundColor: `${alpha(tx.destination_wallet_color ?? T.muted, 9)}`, color: ink(tx.destination_wallet_color ?? T.muted) }}>
                    {tx.destination_wallet_name}
                  </span>
                </div>
              )}
              <div>
                <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">Importado</div>
                <div className="text-fg-subtle text-xs">
                  {new Date(tx.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {tx.manually_added && <span className="ml-1.5 text-brand font-medium">· Manual</span>}
                </div>
              </div>
              {tx.linked_tx_id && tx.linked_tx_timestamp && (
                <div className="col-span-2">
                  <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">
                    {tx.operation_type === 'STAKING_UNLOCK' ? 'Staking purchase vinculado' : 'Staking redemption vinculada'}
                  </div>
                  <div className="text-xs text-warning/80 mono">
                    {new Date(tx.linked_tx_timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {tx.linked_tx_amount ? formatNumber(parseFloat(tx.linked_tx_amount), 6, 6) : ''} {tx.linked_tx_asset}
                  </div>
                </div>
              )}
              {tx.notes && (
                <div className="col-span-2">
                  <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">Notas</div>
                  <div className="text-fg-muted">{tx.notes}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
