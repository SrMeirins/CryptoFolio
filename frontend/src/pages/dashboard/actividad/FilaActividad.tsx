import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Wallet } from 'lucide-react'
import type { Transaction } from '../../../api/portfolio'
import { FIAT_CURRENCIES, opMetaOf, type OpGroup } from '../../../constants/operations'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { alpha, ink } from '../../../utils/colors'
import { formatAmount, formatMoney, type Currency } from '../../../utils/format'
import { calcEurValue, toDisplayAmount } from '../../history/helpers'
import { localTimeOf } from '../../../utils/recentActivity'

// Fila de Actividad reciente (#237, #516): la operación (o la ráfaga agrupada
// del mismo tipo, activo y minuto, con su recuento y desplegable) abre su
// detalle en el Historial; un icono secundario abre el activo en Portfolio.
// La insignia del tipo usa el catálogo de nombres de #488.

export interface ItemActividad { tx: Transaction; group: OpGroup }

const TONO: Partial<Record<OpGroup, string>> = { buy: 'text-positive-ink', sell: 'text-negative-ink', income: 'text-accent-purple' }
const SIGNO: Partial<Record<OpGroup, string>> = { buy: '+', income: '+', sell: '−' }
const historial = (tx: Transaction) => `/history?buscar=${encodeURIComponent(tx.asset)}&tx=${encodeURIComponent(tx.id)}`

function Detalle({ items, currency }: { items: ItemActividad[]; currency: Currency }) {
  const { tx, group } = items[0]
  const meta = opMetaOf(tx)
  const cantidad = items.reduce((s, i) => s + Number(i.tx.amount), 0)
  const valores = items.map(i => toDisplayAmount(calcEurValue(i.tx), i.tx, currency))
  const valor = valores.every(v => v == null) ? null : valores.reduce<number>((s, v) => s + (v ?? 0), 0)
  return (
    <>
      <CryptoIcon symbol={tx.asset} size={28} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-fg">{tx.asset}</span>
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: alpha(meta.color, 10), color: meta.color }}>
            {items.length > 1 ? `${items.length} × ${meta.label}` : meta.label}
          </span>
          {tx.wallet_name && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: alpha(tx.wallet_color, 10), color: ink(tx.wallet_color) }}>{tx.wallet_name}</span>
          )}
        </span>
        <span className={`block text-xs mono mt-0.5 ${TONO[group] ?? 'text-fg-muted'}`}>{SIGNO[group] ?? ''}{formatAmount(cantidad, 6)} {tx.asset}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-sm mono font-semibold text-fg">{valor != null ? formatMoney(valor, currency) : '—'}</span>
        <span className="block text-[11px] mono text-fg-subtle">{localTimeOf(tx.timestamp)}</span>
      </span>
    </>
  )
}

export function FilaActividad({ items, currency }: { items: ItemActividad[]; currency: Currency }) {
  const [abierta, setAbierta] = useState(false)
  const { tx } = items[0]
  const meta = opMetaOf(tx)
  const rafaga = items.length > 1
  const cantidad = items.reduce((s, i) => s + Number(i.tx.amount), 0)
  const nombre = `${rafaga ? `${items.length} operaciones de ${meta.label.toLowerCase()}` : meta.label} de ${formatAmount(cantidad, 6)} ${tx.asset}, ${localTimeOf(tx.timestamp)}`
  const accion = 'size-7 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
  return (
    <li className="relative pl-5">
      <span aria-hidden="true" className="absolute -left-[5px] top-6 w-2.5 h-2.5 rounded-full ring-4 ring-background-card" style={{ background: meta.color }} />
      <div className="flex items-center gap-1 rounded-lg hover:bg-overlay/4">
        <Link to={historial(tx)} aria-label={`${nombre}. Ver ${rafaga ? 'la primera' : 'la operación'} en el Historial`}
          className="flex-1 min-w-0 flex items-center gap-3 px-2.5 py-2 rounded-lg text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <Detalle items={items} currency={currency} />
        </Link>
        {!FIAT_CURRENCIES.has(tx.asset.toUpperCase()) && (
          <Link to={`/portfolio?activo=${encodeURIComponent(tx.asset)}`} aria-label={`Ver ${tx.asset} en Portfolio`} className={accion}>
            <Wallet size={14} aria-hidden="true" />
          </Link>
        )}
        {rafaga && (
          <button type="button" onClick={() => setAbierta(a => !a)} aria-expanded={abierta}
            aria-label={`${abierta ? 'Ocultar' : 'Mostrar'} las ${items.length} operaciones`} className={accion}>
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${abierta ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {rafaga && abierta && (
        <ol aria-label={`Operaciones de la ráfaga de ${tx.asset}`} className="ml-10 mb-1 border-l border-border pl-3 space-y-0.5">
          {items.map(i => (
            <li key={i.tx.id}>
              <Link to={historial(i.tx)} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-xs hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={`${opMetaOf(i.tx).label} de ${formatAmount(Number(i.tx.amount), 6)} ${i.tx.asset}, ${localTimeOf(i.tx.timestamp)}. Ver en el Historial`}>
                <span className="mono text-fg-muted">{formatAmount(Number(i.tx.amount), 6)} {i.tx.asset}</span>
                <span className="mono text-fg-subtle">{localTimeOf(i.tx.timestamp)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}
