import { useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { CryptoIcon } from '../../components/CryptoIcon'
import { Casilla } from './Casilla'
import { WithdrawalRow } from './WithdrawalRow'
import { WithdrawalSelector } from './WithdrawalSelector'
import { etiquetaDestino } from './specialDestinations'
import { fmtAmt, txKey } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction } from './types'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })

// Retiros de un activo sin dirección en el archivo (#321): una fila compacta con
// destino para todo el activo; al desplegar, cada retiro con su propio destino.
export function WithdrawalAssetGroup({ id, asset, txs, destinations, selected, coldWallets, sugerencias, resaltado,
  onAssignGroup, onAssignTx, onToggleGroup, onToggleTx, onAceptarSugerencias }: {
  id: string
  asset: string
  txs: PreviewTransaction[]
  destinations: Record<string, string>
  selected: Set<string>
  coldWallets: { id: string; name: string; color: string }[]
  /** Destino recordado por retiro pendiente (no asignado hasta aceptarlo). */
  sugerencias: Record<string, string>
  resaltado: boolean
  onAssignGroup: (dest: string) => void
  onAssignTx: (key: string, dest: string) => void
  onToggleGroup: () => void
  onToggleTx: (key: string) => void
  onAceptarSugerencias: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const keys = txs.map(txKey)
  const asignados = keys.filter(k => destinations[k]).length
  const dests = [...new Set(keys.map(k => destinations[k] ?? ''))]
  const valor = dests.length === 1 ? dests[0] : ''
  const total = txs.reduce((s, t) => s + t.amountNet, 0)
  const enSel = keys.filter(k => selected.has(k)).length
  const sug = keys.map(k => sugerencias[k]).filter(Boolean)
  const sugUnica = sug.length > 0 && new Set(sug).size === 1 ? etiquetaDestino(sug[0], coldWallets) : null
  const cuentas = [...new Set(txs.map(t => t.account))]

  return (
    <div id={id} tabIndex={-1} data-pendiente={asignados < keys.length || undefined}
      className={`rounded-xl border transition-shadow focus:outline-hidden ${resaltado ? 'ring-2 ring-brand/60' : ''} ${asignados === keys.length ? 'border-positive/30' : 'border-border'}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap bg-background-tertiary/60 rounded-t-xl">
        <Casilla estado={enSel === 0 ? false : enSel === keys.length ? true : 'mixed'} onChange={onToggleGroup} label={`Seleccionar los retiros de ${asset}`} />
        <span className={`w-2 h-2 rounded-full shrink-0 ${asignados === keys.length ? 'bg-positive' : asignados > 0 ? 'bg-warning' : 'bg-fg-subtle/50'}`} aria-hidden="true" />
        <CryptoIcon symbol={asset} size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-sm"><span className="font-bold mono">{asset}</span> <span className="text-xs text-fg-subtle">· {txs.length} retiro{txs.length !== 1 ? 's' : ''} · {fmtAmt(total)} · desde {fecha(txs[0].timestamp)}{cuentas.length === 1 ? ` · ${cuentas[0]}` : ''}</span></p>
          {dests.length > 1 && <p className="text-[11px] text-warning">Destinos distintos dentro del activo</p>}
          {sug.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-fg-muted mt-0.5">
              <History size={11} className="text-brand" aria-hidden="true" />
              {sugUnica ? <>Como la última vez: <span className="text-fg font-medium">{sugUnica}</span></> : `Sugerencias de la última vez para ${sug.length}`}
              <button type="button" onClick={onAceptarSugerencias} className="text-brand font-medium hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">Aceptar</button>
            </p>
          )}
        </div>
        <WithdrawalSelector value={valor} coldWallets={coldWallets} onChange={onAssignGroup} label={`Destino de los retiros de ${asset}`}
          placeholder={dests.length > 1 ? 'Varios destinos' : undefined} />
        {txs.length > 1 && (
          <button type="button" onClick={() => setAbierto(o => !o)} aria-expanded={abierto} aria-controls={`${id}-detalle`}
            aria-label={abierto ? `Ocultar los retiros de ${asset}` : `Ver los retiros de ${asset}`}
            className="p-1 rounded-md text-fg-subtle hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
            <ChevronDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
        {txs.length === 1 && <span className="w-[22px] shrink-0" aria-hidden="true" />}
      </div>
      {abierto && (
        <div id={`${id}-detalle`} className="divide-y divide-border border-t border-border">
          {txs.map(tx => {
            const k = txKey(tx)
            return <WithdrawalRow key={k} tx={tx} dest={destinations[k]} isSelected={selected.has(k)} coldWallets={coldWallets}
              onToggleSelect={() => onToggleTx(k)} onChangeDest={v => onAssignTx(k, v)} />
          })}
        </div>
      )}
    </div>
  )
}
