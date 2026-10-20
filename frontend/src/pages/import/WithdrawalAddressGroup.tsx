import { useState } from 'react'
import { BadgeCheck, ChevronDown, ExternalLink, Network as NetworkIcon, Wallet } from 'lucide-react'
import type { Network } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { buttonClasses } from '../../components/ui'
import { ink } from '../../utils/colors'
import { DireccionTag } from './DireccionTag'
import { urlExplorador, type GrupoDireccion, type WalletReconocida } from './direcciones'
import { WithdrawalSelector } from './WithdrawalSelector'
import { Casilla } from './Casilla'
import { fmtAmt, txKey } from './withdrawalDestinationsHelpers'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })

// Retiros a una misma dirección (#320): una sola decisión de destino para todos.
export function WithdrawalAddressGroup({ id, grupo, red, destinations, coldWallets, reconocida, onAssign, onGuardar, selected, onToggle, resaltado }: {
  id: string
  grupo: GrupoDireccion
  selected: Set<string>
  onToggle: () => void
  resaltado: boolean
  red: Network | undefined
  destinations: Record<string, string>
  coldWallets: { id: string; name: string; color: string }[]
  reconocida: WalletReconocida | undefined
  onAssign: (dest: string) => void
  onGuardar: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const dests = [...new Set(grupo.txs.map(t => destinations[txKey(t)] ?? ''))]
  const valor = dests.length === 1 ? dests[0] : ''
  const asignados = grupo.txs.filter(t => destinations[txKey(t)]).length
  const activos = [...new Set(grupo.txs.map(t => t.asset))]
  // Guardar solo tiene sentido si puede ser tuya: no para un regalo o una pérdida.
  const puedeGuardar = !reconocida && valor !== '__gift__' && valor !== '__lost__'
  const detalleId = `${id}-detalle`
  const enSel = grupo.txs.filter(t => selected.has(txKey(t))).length

  return (
    <div id={id} tabIndex={-1} data-pendiente={asignados < grupo.txs.length || undefined}
      className={`rounded-xl border transition-shadow focus:outline-hidden ${resaltado ? 'ring-2 ring-brand/60' : ''} ${reconocida ? 'border-positive/30' : 'border-border'}`}>
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap bg-background-tertiary/60 rounded-t-xl">
        <Casilla estado={enSel === 0 ? false : enSel === grupo.txs.length ? true : 'mixed'} onChange={onToggle} label="Seleccionar los retiros a esta dirección" />
        <span className={`w-2 h-2 rounded-full shrink-0 ${asignados === grupo.txs.length ? 'bg-positive' : asignados > 0 ? 'bg-warning' : 'bg-fg-subtle/50'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-overlay/5 text-fg-muted">
              <NetworkIcon size={10} aria-hidden="true" />{grupo.network ?? 'Red desconocida'}
            </span>
            <DireccionTag address={grupo.address} explorerUrl={urlExplorador(red?.explorer_url, '{address}', grupo.address)} />
          </div>
          <p className="text-xs text-fg-subtle">
            {grupo.txs.length} retiro{grupo.txs.length !== 1 ? 's' : ''} · {activos.join(', ')} · desde {fecha(grupo.txs[0].timestamp)}
            {dests.length > 1 && <span className="text-warning"> · destinos distintos</span>}
          </p>
        </div>
        <WithdrawalSelector value={valor} coldWallets={coldWallets} onChange={onAssign} label="Destino de los retiros a esta dirección"
          placeholder={dests.length > 1 ? 'Varios destinos' : undefined} />
        <button type="button" onClick={() => setAbierto(o => !o)} aria-expanded={abierto} aria-controls={detalleId}
          aria-label={abierto ? 'Ocultar los retiros' : 'Ver los retiros'}
          className="p-1 rounded-md text-fg-subtle hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
          <ChevronDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {(reconocida || puedeGuardar) && (
        <div className="px-4 py-2 border-t border-border">
          {reconocida ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-positive">
              <BadgeCheck size={13} aria-hidden="true" /> Reconocida ·
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: ink(reconocida.color) }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: reconocida.color }} aria-hidden="true" />{reconocida.name}
              </span>
            </span>
          ) : valor === '__external__' ? (
            <div className="flex items-center gap-3 flex-wrap rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
              <Wallet size={15} className="text-brand shrink-0" aria-hidden="true" />
              <p className="text-xs text-fg-muted flex-1 min-w-48">¿Es una wallet tuya? Guárdala y la próxima vez estos retiros se asignarán solos.</p>
              <button type="button" onClick={onGuardar} className={buttonClasses('primary', 'sm')}>Guardar en mi wallet</button>
            </div>
          ) : (
            <button type="button" onClick={onGuardar}
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">
              <Wallet size={12} aria-hidden="true" /> ¿Es tuya? Guardar en mi wallet
            </button>
          )}
        </div>
      )}

      {abierto && (
        <ul id={detalleId} className="divide-y divide-border border-t border-border">
          {grupo.txs.map(tx => {
            const txUrl = urlExplorador(red?.explorer_tx_url, '{tx_hash}', tx.destino?.txHash)
            return (
              <li key={txKey(tx)} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="mono text-fg-muted w-20 shrink-0">{fecha(tx.timestamp)}</span>
                <CryptoIcon symbol={tx.asset} size={16} />
                <span className="mono font-semibold text-negative">−{fmtAmt(tx.amountNet)} <span className="text-fg-subtle font-normal">{tx.asset}</span></span>
                <span className="text-fg-subtle">{tx.account}</span>
                <span className="flex-1" />
                {txUrl && (
                  <a href={txUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg-subtle hover:text-fg">
                    Transacción <ExternalLink size={10} aria-hidden="true" />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
