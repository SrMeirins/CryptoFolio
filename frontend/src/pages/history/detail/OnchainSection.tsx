import { ExternalLink } from 'lucide-react'
import type { TransactionDetail } from '../../../api/portfolio'
import { CopyButton } from '../../../components/CopyButton'

// Datos on-chain de una transacción (#373): hash y dirección con su red, con
// enlace al explorador (sitio de terceros, en pestaña nueva) y botón de copiar.

function Field({ label, value, url, network }: { label: string; value: string; url: string | null; network: string | null }) {
  return (
    <div>
      <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-0.5">{label}</div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="mono text-fg break-all">{value}</span>
        <CopyButton text={value} size={11} title={`Copiar ${label.toLowerCase()}`} />
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-ink hover:underline shrink-0 rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            Explorador{network ? ` de ${network}` : ''} <ExternalLink size={11} aria-hidden="true" />
            <span className="sr-only">(abre un sitio externo en una pestaña nueva)</span>
          </a>
        )}
      </div>
    </div>
  )
}

export function OnchainSection({ onchain }: { onchain: TransactionDetail['onchain'] }) {
  if (!onchain.tx_hash && !onchain.address) return null
  return (
    <div className="space-y-2">
      {onchain.tx_hash && <Field label="Hash" value={onchain.tx_hash} url={onchain.tx_url} network={onchain.network} />}
      {onchain.address && <Field label="Dirección de destino" value={onchain.address} url={onchain.address_url} network={onchain.network} />}
      {(onchain.tx_url || onchain.address_url) && (
        <p className="text-[11px] text-fg-subtle">El explorador es un sitio de terceros: al abrirlo, ve la dirección o el hash que consultas.</p>
      )}
    </div>
  )
}
