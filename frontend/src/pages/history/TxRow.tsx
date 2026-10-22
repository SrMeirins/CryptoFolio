import { useState, useEffect, useRef } from 'react'
import { Trash2, PenLine, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import type { Transaction } from '../../api/portfolio'
import { CopyButton } from '../../components/CopyButton'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatMoney, formatAmount, type Currency, formatNumber } from '../../utils/format'
import { OP_META } from '../../constants/operations'
import { fmtDate, calcEurValue, formatPriceLine, toDisplayAmount, valuationHint, flowSign } from './helpers'
import { APP_TIMEZONE } from '../../constants/timezone'
import { T, alpha, ink } from '../../utils/colors'
import { iconButtonClasses } from '../../components/ui'
import { DeleteConfirm } from './DeleteConfirm'
import { FeeCell } from './FeeCell'
import { GroupedFeesDetail } from './GroupedFeesDetail'

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

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: APP_TIMEZONE }

/** Importe con su marca de estimación (≈) o «—» sin precio, con el motivo como texto accesible (#346). */
function ValuedAmount({ value, hint, currency, className }: {
  value: number | null; hint: string | null; currency: Currency; className: string
}) {
  if (value == null) {
    return (
      <span className="text-fg-subtle text-xs" title={hint ?? undefined}>
        <span aria-hidden="true">—</span>{hint && <span className="sr-only">{hint}</span>}
      </span>
    )
  }
  return (
    <span className={className} title={hint ?? undefined}>
      {hint && <span aria-hidden="true">≈ </span>}{formatMoney(value, currency)}
      {hint && <span className="sr-only"> ({hint})</span>}
    </span>
  )
}

function OpChip({ type }: { type: string }) {
  const meta = OP_META[type] ?? { label: type, color: T.muted }
  return (
    <span
      className="inline-flex items-center font-semibold rounded-lg text-xs px-1.5 py-0.5 whitespace-nowrap shrink-0"
      // ink(): mismo tono con la luminosidad acotada para cumplir 4,5:1 en ambos temas (#351).
      style={{ backgroundColor: `${alpha(meta.color, 13)}`, color: ink(meta.color) }}
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
  const deleteRef = useRef<HTMLButtonElement>(null)
  const detailId = `tx-detalle-${tx.id}`
  function cancelDelete() {
    setConfirmDelete(false)
    // Devuelve el foco al botón de origen cuando vuelve a existir.
    requestAnimationFrame(() => deleteRef.current?.focus())
  }

  const meta   = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: T.muted, group: 'other', rowBg: 'transparent' }
  const sign = flowSign(tx.operation_type)
  const amountColor = sign === '+' ? 'text-positive' : sign === '−' && meta.group === 'sell' ? 'text-negative' : 'text-fg'

  const { date, time } = fmtDate(tx.timestamp)
  // Valor en la moneda de visualización, con el tipo de la fecha de la operación (#177).
  const eurValue = toDisplayAmount(calcEurValue(tx), tx, currency)
  const priceLine = formatPriceLine(tx)
  const valueHint = valuationHint(tx.value_source)

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
              <span className="text-xs px-1 py-0.5 rounded-lg bg-brand/15 text-brand-ink font-bold shrink-0" title="Añadida manualmente">
                <span aria-hidden="true">M</span><span className="sr-only">Añadida manualmente</span>
              </span>
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
                <span className={`text-xs mono font-semibold ${amountColor}`}>
                  {sign}{formatAmount(tx.amount_net, 6)}
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
          <div>
            <ValuedAmount value={eurValue} hint={valueHint} currency={currency}
              className={`text-sm mono font-semibold ${tx.value_source === 'estimado' ? 'text-fg-muted' : 'text-fg'}`} />
          </div>
          {eurValue != null && priceLine && <div className="text-xs text-fg-subtle mono mt-0.5">@ {priceLine}</div>}
        </td>

        {/* Fee: propia y agrupadas (#371) */}
        <td className="px-3 py-2.5 align-middle">
          <FeeCell tx={tx} currency={currency} />
        </td>

        {/* Wallet */}
        <td className="px-3 py-2.5 align-middle">
          {tx.operation_type === 'TRANSFER_INTERNAL' && tx.destination_wallet_name ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                style={{ backgroundColor: `${alpha(tx.wallet_color, 9)}`, color: ink(tx.wallet_color) }}>
                {tx.wallet_name}
              </span>
              <ArrowRight size={10} aria-hidden="true" className="text-fg-subtle shrink-0" /><span className="sr-only">hacia</span>
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
              // Ocultas en reposo, pero visibles con hover, con foco dentro de la
              // fila y siempre en pantallas táctiles, donde no hay hover (#351).
              <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity flex gap-0.5">
                <button type="button" onClick={() => onEdit(tx)}
                  className={iconButtonClasses('md', false, '', 'brand')}
                  title="Editar transacción" aria-label="Editar transacción">
                  <PenLine size={12} aria-hidden="true" />
                </button>
                {tx.manually_added && (
                  <button type="button" ref={deleteRef} onClick={() => setConfirmDelete(true)}
                    className={iconButtonClasses('md', false, '', 'danger')}
                    title="Eliminar transacción" aria-label="Eliminar transacción">
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            {tx.manually_added && confirmDelete && (
              <DeleteConfirm onConfirm={() => onDelete(tx.id)} onCancel={cancelDelete} isDeleting={isDeleting} />
            )}
            <button type="button" onClick={() => setExpanded(e => !e)}
              aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
              className={iconButtonClasses('sm')} aria-label={expanded ? 'Contraer detalle' : 'Expandir detalle'}>
              {expanded ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            </button>
          </div>
        </td>
      </tr>

      {/* Fila expandida */}
      {expanded && (
        <tr id={detailId} className="bg-background-tertiary/15">
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
                  {new Date(tx.created_at).toLocaleDateString('es-ES', SHORT_DATE)}
                  {tx.manually_added && <span className="ml-1.5 text-brand font-medium">· Manual</span>}
                </div>
              </div>
              {tx.linked_tx_id && tx.linked_tx_timestamp && (
                <div className="col-span-2">
                  <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">
                    {tx.operation_type === 'STAKING_UNLOCK' ? 'Bloqueo de staking vinculado' : 'Desbloqueo de staking vinculado'}
                  </div>
                  <div className="text-xs text-warning/80 mono">
                    {new Date(tx.linked_tx_timestamp).toLocaleDateString('es-ES', SHORT_DATE)}
                    {' · '}
                    {tx.linked_tx_amount ? formatNumber(parseFloat(tx.linked_tx_amount), 6, 6) : ''} {tx.linked_tx_asset}
                  </div>
                </div>
              )}
              <GroupedFeesDetail tx={tx} currency={currency} />
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
