import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { TransactionDetail } from '../../../api/portfolio'
import { CopyButton } from '../../../components/CopyButton'
import { formatAmount, formatMoney, type Currency } from '../../../utils/format'
import { calcEurValue, flowSign, fmtDate, formatPriceLine, toDisplayAmount, valuationHint } from '../helpers'
import { FeeCell } from '../FeeCell'
import { GroupedFeesDetail } from '../GroupedFeesDetail'
import { FifoTrace } from './FifoTrace'
import { ImportEditsSection } from './ImportEditsSection'
import { OriginSection } from './OriginSection'
import { OnchainSection } from './OnchainSection'
import { fiscalLink, portfolioLink } from './detailLinks'

// Contenido del panel de detalle (#373): resumen y valoración, trazabilidad
// FIFO, origen, datos on-chain y enlaces a Fiscal y Portfolio. Sin estado ni
// efectos, para poder probarlo con render estático.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4 border-t border-border">
      <h3 className="text-[11px] text-fg-subtle uppercase tracking-widest font-semibold mb-2">{title}</h3>
      {children}
    </section>
  )
}

export function DetailBody({ data, currency, onOpen, walletName = () => undefined, onRestore = () => {}, restoring = false }: {
  data: TransactionDetail
  currency: Currency
  /** Abre otra transacción en el mismo panel (operaciones relacionadas). */
  onOpen: (id: string) => void
  /** Nombre de una wallet por su id, para las diferencias de una editada (#378). */
  walletName?: (id: string) => string | undefined
  /** Restaura los valores importados de una editada (#378). */
  onRestore?: (id: string) => void
  restoring?: boolean
}) {
  const tx = data.transaction
  const value = toDisplayAmount(calcEurValue(tx), tx, currency)
  const hint = valuationHint(tx.value_source)
  const priceLine = formatPriceLine(tx)
  return (
    <>
      <Section title="Resumen">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div><dt className="text-fg-subtle">Importe</dt><dd className="mono text-fg">{flowSign(tx.operation_type)}{formatAmount(tx.amount_net, 8)} {tx.asset}</dd></div>
          <div><dt className="text-fg-subtle">Valor</dt>
            <dd className="mono text-fg" title={hint ?? undefined}>
              {value === null ? '—' : `${tx.value_source === 'estimado' ? '≈ ' : ''}${formatMoney(value, currency)}`}
              {hint && <span className="sr-only"> ({hint})</span>}
            </dd></div>
          {priceLine && <div><dt className="text-fg-subtle">Precio unitario</dt><dd className="mono text-fg">{priceLine}</dd></div>}
          <div><dt className="text-fg-subtle">Comisiones</dt><dd><FeeCell tx={tx} currency={currency} verbose /></dd></div>
          <div><dt className="text-fg-subtle">Wallet</dt><dd className="text-fg">{tx.wallet_name}{tx.account ? ` · ${tx.account}` : ''}</dd></div>
          {tx.destination_wallet_name && <div><dt className="text-fg-subtle">Destino</dt><dd className="text-fg">{tx.destination_wallet_name}</dd></div>}
          <div className="col-span-2"><dt className="text-fg-subtle">ID</dt>
            <dd className="mono text-fg-subtle break-all flex items-center gap-1">{tx.id}<CopyButton text={tx.id} size={10} title="Copiar ID" /></dd></div>
          {tx.linked_tx_id && (
            <div className="col-span-2"><dt className="text-fg-subtle">{tx.operation_type === 'STAKING_UNLOCK' ? 'Bloqueo de staking vinculado' : 'Desbloqueo de staking vinculado'}</dt>
              <dd><button type="button" onClick={() => onOpen(tx.linked_tx_id!)}
                className="text-left text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                {tx.linked_tx_timestamp ? `${fmtDate(tx.linked_tx_timestamp).date} · ` : ''}{tx.linked_tx_amount ? formatAmount(tx.linked_tx_amount, 6) : ''} {tx.linked_tx_asset}
              </button></dd></div>
          )}
          {tx.notes && <div className="col-span-2"><dt className="text-fg-subtle">Notas</dt><dd className="text-fg-muted whitespace-pre-wrap">{tx.notes}</dd></div>}
          <GroupedFeesDetail tx={tx} currency={currency} onOpen={onOpen} />
        </dl>
      </Section>
      {tx.original_import && (
        <Section title="Editada a mano">
          <ImportEditsSection tx={tx} walletName={walletName} onRestore={onRestore} restoring={restoring} />
        </Section>
      )}
      <Section title="Trazabilidad FIFO (EUR, como Fiscal)"><FifoTrace fifo={data.fifo} onOpen={onOpen} /></Section>
      <Section title="Origen"><OriginSection origin={data.origin} manual={tx.manually_added} /></Section>
      {(data.onchain.tx_hash || data.onchain.address) && <Section title="On-chain"><OnchainSection onchain={data.onchain} /></Section>}
      <Section title="Ver también">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {data.fiscal_years.map(y => (
            <li key={y}><Link to={fiscalLink(y)} className="text-brand-ink hover:underline">Fiscal {y}</Link></li>
          ))}
          <li><Link to={portfolioLink(tx.asset)} className="text-brand-ink hover:underline">{tx.asset} en Portfolio</Link></li>
        </ul>
      </Section>
    </>
  )
}
