import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownToLine, Check, Eye, EyeOff, History, MapPin } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { buttonClasses } from '../../components/ui'
import { DepositSection } from './DepositSection'
import { AssignBar } from './AssignBar'
import { WithdrawalAssetGroup } from './WithdrawalAssetGroup'
import { WithdrawalAddressGroup } from './WithdrawalAddressGroup'
import { GuardarDireccionModal } from './GuardarDireccionModal'
import { agruparPorDireccion, walletsPorDireccion, type GrupoDireccion } from './direcciones'
import { idActivo, idDeposito, idDireccion, siguientePendiente, sugerenciasPendientes } from './revisionHelpers'
import { txKey, loadMemory, saveMemory } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction, DepositReview } from './types'


// Revisión obligatoria (#321): un solo scroll con la cabecera fija, asignación
// masiva unificada, sugerencias visibles y salto al siguiente pendiente.
export function WithdrawalDestinations({ withdrawals, destinations, onAssign, deposits, depositCosts, onSetDepositCost }: {
  withdrawals: PreviewTransaction[]
  destinations: Record<string, string>
  onAssign: (txKey: string, walletId: string) => void
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetDepositCost: (txKey: string, price: number | null) => void
}) {
  const [selected,        setSelected]        = useState<Set<string>>(new Set())
  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [guardando,       setGuardando]       = useState<GrupoDireccion | null>(null)
  const [ultimaWallet,    setUltimaWallet]    = useState<string | null>(null)
  const [resaltado,       setResaltado]       = useState<string | null>(null)
  const ultimoSalto = useRef<string | null>(null)
  // La memoria se lee una vez: es la de importaciones anteriores, no la de esta sesión.
  const [memoria] = useState(loadMemory)

  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWalletsFull })
  const { data: redes = [] } = useQuery({ queryKey: ['networks'], queryFn: portfolioApi.getNetworks, staleTime: 5 * 60_000 })
  const coldWallets = useMemo(() => wallets.filter(w => w.type !== 'exchange' && w.name !== 'Wallets externas'), [wallets])

  // Retiros con dirección: una decisión por dirección (#320); el resto, por activo.
  const { grupos, sinDireccion } = useMemo(() => agruparPorDireccion(withdrawals), [withdrawals])
  const reconocidas = useMemo(() => walletsPorDireccion(coldWallets), [coldWallets])
  const pendientesDeGuardar = grupos.filter(g => !reconocidas.has(g.clave))

  // Dirección reconocida → se asigna sola a su wallet (editable). Solo lo que aún no tiene destino.
  const firmaReconocidas = grupos.map(g => `${g.clave}:${reconocidas.get(g.clave)?.id ?? ''}`).join('|')
  useEffect(() => {
    for (const g of grupos) {
      const w = reconocidas.get(g.clave)
      if (!w) continue
      for (const tx of g.txs) if (!destinations[txKey(tx)]) onAssign(txKey(tx), w.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaReconocidas])

  // Destinos recordados: sugerencias visibles, no asignaciones (#321).
  const sugerencias = useMemo(
    () => sugerenciasPendientes(sinDireccion, destinations, memoria, coldWallets.map(w => w.id), txKey),
    [sinDireccion, destinations, memoria, coldWallets],
  )
  const numSugerencias = Object.keys(sugerencias).length

  const byAsset = useMemo(() => {
    const out = new Map<string, PreviewTransaction[]>()
    for (const tx of [...sinDireccion].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())) {
      out.set(tx.asset, [...(out.get(tx.asset) ?? []), tx])
    }
    return out
  }, [sinDireccion])
  const assets = [...byAsset.keys()]

  const allTxKeys      = withdrawals.map(txKey)
  const pendingKeys    = allTxKeys.filter(k => !destinations[k])
  const assignedCount  = allTxKeys.length - pendingKeys.length
  const depositsReviewedCount = deposits.filter(d => d.txKey in depositCosts).length
  const totalItems = allTxKeys.length + deposits.length
  const doneItems  = assignedCount + depositsReviewedCount
  const allDone    = doneItems === totalItems
  const progress   = totalItems > 0 ? (doneItems / totalItems) * 100 : 0

  const pendienteGrupo = (txs: PreviewTransaction[]) => txs.some(t => !destinations[txKey(t)])
  const gruposVisibles = showOnlyPending ? grupos.filter(g => pendienteGrupo(g.txs)) : grupos
  const assetsVisibles = showOnlyPending ? assets.filter(a => pendienteGrupo(byAsset.get(a)!)) : assets
  const ocultos = grupos.length + assets.length - gruposVisibles.length - assetsVisibles.length

  // Orden visual de los elementos que se revisan, para «Ir al siguiente pendiente».
  const orden = [
    ...grupos.map(g => ({ id: idDireccion(g.clave), pendiente: pendienteGrupo(g.txs) })),
    ...assets.map(a => ({ id: idActivo(a), pendiente: pendienteGrupo(byAsset.get(a)!) })),
    ...deposits.map(d => ({ id: idDeposito(d.txKey), pendiente: !(d.txKey in depositCosts) })),
  ]
  const hayPendiente = orden.some(i => i.pendiente)

  function irAlSiguiente() {
    const id = siguientePendiente(orden, ultimoSalto.current)
    if (!id) return
    ultimoSalto.current = id
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // El foco va al primer control del elemento para seguir con el teclado.
    const control = el.querySelector<HTMLElement>('button[aria-haspopup="listbox"], input')
    ;(control ?? el).focus({ preventScroll: true })
    setResaltado(id)
    setTimeout(() => setResaltado(r => (r === id ? null : r)), 1600)
  }

  // ── Asignación (recuerda el destino por activo y cuenta para sugerirlo la próxima vez) ──
  function asignar(keys: string[], dest: string) {
    const recordados = new Set<string>()
    for (const k of keys) {
      onAssign(k, dest)
      const tx = sinDireccion.find(t => txKey(t) === k)
      if (tx && !recordados.has(`${tx.asset}|${tx.account}`)) { saveMemory(`${tx.asset}|${tx.account}`, dest); recordados.add(`${tx.asset}|${tx.account}`) }
    }
  }

  function aceptarSugerencias(keys: string[]) {
    for (const k of keys) if (sugerencias[k]) onAssign(k, sugerencias[k])
  }

  function toggleKeys(keys: string[]) {
    setSelected(prev => {
      const s = new Set(prev)
      const todas = keys.every(k => s.has(k))
      keys.forEach(k => (todas ? s.delete(k) : s.add(k)))
      return s
    })
  }

  function asignarEnBloque(dest: string) {
    asignar(selected.size > 0 ? [...selected] : pendingKeys, dest)
    setSelected(new Set())
  }

  function alGuardar(g: GrupoDireccion, wallet: { id: string }, siguiente: boolean) {
    asignar(g.txs.map(txKey), wallet.id)
    setUltimaWallet(wallet.id)
    const resto = pendientesDeGuardar.filter(p => p.clave !== g.clave && !['__gift__', '__lost__'].includes(destinations[txKey(p.txs[0])] ?? ''))
    setGuardando(siguiente && resto.length > 0 ? resto[0] : null)
  }

  return (
    <section aria-labelledby="revision-titulo" className={`rounded-xl border-2 transition-colors duration-300 ${allDone ? 'border-positive/40' : 'border-warning/40'}`}>
      {/* Cabecera fija mientras se desplaza la página */}
      <div className={`sticky top-0 z-10 px-5 py-3 rounded-t-[10px] backdrop-blur border-b border-border ${allDone ? 'bg-positive/10' : 'bg-background-card/95'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h2 id="revision-titulo" className={`text-sm font-semibold ${allDone ? 'text-positive' : 'text-warning'}`}>
              {allDone ? 'Revisión completada' : 'Revisión obligatoria antes de importar'}
            </h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium mono ${allDone ? 'bg-positive/20 text-positive-ink' : 'bg-warning/20 text-warning'}`}>
              {doneItems}/{totalItems}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {numSugerencias > 0 && (
              <button type="button" onClick={() => aceptarSugerencias(Object.keys(sugerencias))} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
                <History size={12} aria-hidden="true" /> Aceptar {numSugerencias} sugerencia{numSugerencias !== 1 ? 's' : ''}
              </button>
            )}
            {hayPendiente && (
              <button type="button" onClick={irAlSiguiente} className={buttonClasses('primary', 'sm', 'flex gap-1.5')}>
                <ArrowDownToLine size={12} aria-hidden="true" /> Ir al siguiente pendiente
              </button>
            )}
            {allDone && <span className="inline-flex items-center gap-1 text-xs text-positive"><Check size={13} aria-hidden="true" /> Todo listo</span>}
          </div>
        </div>
        <div className="mt-2 h-1.5 bg-background-tertiary rounded-full overflow-hidden" role="progressbar" aria-label="Elementos revisados"
          aria-valuemin={0} aria-valuemax={totalItems} aria-valuenow={doneItems}>
          <div className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-positive' : 'bg-warning'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="p-5 space-y-4 bg-background-card rounded-b-[10px]">
        <p className="text-xs text-fg-subtle">Asigna el destino de cada retiro y el coste de cada depósito externo.</p>

        {coldWallets.length === 0 && withdrawals.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 rounded-xl px-4 py-2.5 border border-warning/20">
            <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
            {grupos.length > 0
              ? 'Aún no tienes wallets propias: usa «¿Es tuya? Guardar en mi wallet» en una dirección para crear la primera.'
              : 'Sin wallets propias configuradas: solo están disponibles los destinos especiales. Puedes crearlas en Ajustes › Wallets.'}
          </div>
        )}

        {withdrawals.length > 0 && (
          <AssignBar coldWallets={coldWallets} seleccion={selected.size} total={allTxKeys.length} pendientes={pendingKeys.length}
            onToggleTodo={() => setSelected(selected.size === allTxKeys.length ? new Set() : new Set(allTxKeys))}
            onAsignar={asignarEnBloque} onLimpiar={() => setSelected(new Set())} />
        )}

        {grupos.length + assets.length > 1 && (
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowOnlyPending(v => !v)} aria-pressed={showOnlyPending}
              className={`flex items-center gap-1.5 text-xs transition-colors ${showOnlyPending ? 'text-warning' : 'text-fg-subtle hover:text-fg'}`}>
              {showOnlyPending ? <Eye size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />}
              {showOnlyPending ? `Solo pendientes${ocultos > 0 ? ` (${ocultos} revisados ocultos)` : ''}` : 'Solo pendientes'}
            </button>
          </div>
        )}

        {/* Retiros por dirección de destino (#320) */}
        {gruposVisibles.length > 0 && (
          <div role="group" aria-labelledby="retiros-direccion" className="space-y-1.5">
            <h3 id="retiros-direccion" className="flex items-center gap-1.5 px-1 pb-1 text-xs text-fg-subtle">
              <MapPin size={12} aria-hidden="true" /> {grupos.length} {grupos.length === 1 ? 'dirección' : 'direcciones'} de destino
              {reconocidas.size > 0 && <span className="text-positive">· {grupos.length - pendientesDeGuardar.length} reconocida{grupos.length - pendientesDeGuardar.length !== 1 ? 's' : ''}</span>}
            </h3>
            {gruposVisibles.map(g => {
              const id = idDireccion(g.clave)
              return (
                <WithdrawalAddressGroup key={g.clave} id={id} grupo={g} red={redes.find(r => r.id === g.networkId)}
                  destinations={destinations} coldWallets={coldWallets} reconocida={reconocidas.get(g.clave)}
                  selected={selected} onToggle={() => toggleKeys(g.txs.map(txKey))} resaltado={resaltado === id}
                  onAssign={dest => asignar(g.txs.map(txKey), dest)} onGuardar={() => setGuardando(g)} />
              )
            })}
          </div>
        )}

        {/* Retiros sin dirección, por activo */}
        {assetsVisibles.length > 0 && (
          <div role="group" aria-label="Retiros por activo" className="space-y-1.5">
            {grupos.length > 0 && <h3 className="px-1 pt-2 text-xs text-fg-subtle">Sin dirección en el archivo</h3>}
            {assetsVisibles.map(asset => {
              const txs = byAsset.get(asset)!
              const id = idActivo(asset)
              return (
                <WithdrawalAssetGroup key={asset} id={id} asset={asset} txs={txs} destinations={destinations} selected={selected}
                  coldWallets={coldWallets} sugerencias={sugerencias} resaltado={resaltado === id}
                  onAssignGroup={dest => asignar(txs.map(txKey), dest)} onAssignTx={(k, dest) => asignar([k], dest)}
                  onToggleGroup={() => toggleKeys(txs.map(txKey))} onToggleTx={k => toggleKeys([k])}
                  onAceptarSugerencias={() => aceptarSugerencias(txs.map(txKey))} />
              )
            })}
          </div>
        )}

        {deposits.length > 0 && (
          <DepositSection deposits={deposits} depositCosts={depositCosts} onSetCost={onSetDepositCost}
            allReviewed={depositsReviewedCount === deposits.length} reviewedCount={depositsReviewedCount} resaltado={resaltado} />
        )}
      </div>

      {guardando && (
        <GuardarDireccionModal key={guardando.clave} grupo={guardando} wallets={coldWallets} redes={redes}
          preseleccion={ultimaWallet} restantes={pendientesDeGuardar.filter(p => p.clave !== guardando.clave).length}
          onGuardado={(w, siguiente) => alGuardar(guardando, w, siguiente)} onClose={() => setGuardando(null)} />
      )}
    </section>
  )
}
