import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, History, Save } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { buttonClasses, cardClasses } from '../../components/ui'
import { WithdrawalAddressGroup } from './WithdrawalAddressGroup'
import { GuardarDireccionModal } from './GuardarDireccionModal'
import { agruparPorDireccion, walletsPorDireccion, type GrupoDireccion } from './direcciones'
import { etiquetaDestino } from './specialDestinations'
import { txKey } from './withdrawalDestinationsHelpers'
import { idDireccion } from './revisionHelpers'
import { cambiosDeDestino, comoTransaccion, destinosEfectivos } from './existentes'
import type { ResultadoExistentes, RetiroExistente } from './types'

// Retiros ya importados sin dirección (#330): se completan con el historial de
// retiradas o el CSV ya importado. Destino actual preseleccionado; una dirección
// reconocida propone su wallet. Guardar recalcula el FIFO si cambia algún destino.
export function RetirosExistentes({ existentes, onGuardar }: {
  existentes: RetiroExistente[]
  onGuardar: (reasignaciones: Record<string, string>) => Promise<ResultadoExistentes>
}) {
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWalletsFull })
  const { data: redes = [] } = useQuery({ queryKey: ['networks'], queryFn: portfolioApi.getNetworks, staleTime: 5 * 60_000 })
  const coldWallets = useMemo(() => wallets.filter(w => w.type !== 'exchange' && w.name !== 'Wallets externas'), [wallets])
  const reconocidas = useMemo(() => walletsPorDireccion(coldWallets), [coldWallets])

  const txs = useMemo(() => existentes.map(comoTransaccion), [existentes])
  const { grupos } = useMemo(() => agruparPorDireccion(txs), [txs])
  const actuales = useMemo(() => Object.fromEntries(existentes.map(e => [e.id, e.destinoActual])), [existentes])
  // Lo que el usuario elige; el resto, la wallet propuesta por una dirección reconocida o el destino actual.
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<GrupoDireccion | null>(null)
  const [ultimaWallet, setUltimaWallet] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoExistentes | null>(null)
  const [error, setError] = useState<string | null>(null)

  const destinos = useMemo(
    () => destinosEfectivos(grupos.map(g => ({ ids: g.txs.map(txKey), wallet: reconocidas.get(g.clave)?.id ?? null })), actuales, elegidos),
    [grupos, reconocidas, actuales, elegidos],
  )

  const cambios = cambiosDeDestino(actuales, destinos)
  const numCambios = Object.keys(cambios).length

  function asignar(g: GrupoDireccion, dest: string) {
    setElegidos(prev => ({ ...prev, ...Object.fromEntries(g.txs.map(t => [txKey(t), dest])) }))
  }

  async function guardar() {
    setEnviando(true)
    setError(null)
    try { setResultado(await onGuardar(cambios)) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los retiros') }
    finally { setEnviando(false) }
  }

  if (resultado) {
    return (
      <section className={cardClasses('md', 'flex items-start gap-3')} role="status">
        <CheckCircle2 size={20} className="text-positive shrink-0" aria-hidden="true" />
        <div className="text-sm text-fg-muted">
          <p className="font-medium text-fg">Retiros ya importados actualizados</p>
          <p>
            {resultado.direcciones} con dirección guardada · {resultado.destinos} con destino cambiado
            {resultado.comisiones > 0 ? ` · ${resultado.comisiones} con la comisión de red separada` : ''}{resultado.fifo ? ' · FIFO recalculado' : ''}.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="existentes-titulo" className={cardClasses('md', 'space-y-3')}>
      <div className="flex items-start gap-3">
        <History size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h2 id="existentes-titulo" className="text-sm font-medium text-fg">Retiros ya importados · {existentes.length}</h2>
          <p className="text-xs text-fg-muted">
            Ya estaban en tu historial sin dirección o sin la comisión de red separada. Al guardar se completan y, si alguno fue a una wallet tuya, puedes cambiar su destino; se recalculará el FIFO.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        {grupos.map(g => {
          const ids = g.txs.map(txKey)
          const actualesGrupo = [...new Set(ids.map(i => actuales[i]))]
          return (
            <WithdrawalAddressGroup key={g.clave} id={`ex-${idDireccion(g.clave)}`} grupo={g} red={redes.find(r => r.id === g.networkId)}
              destinations={destinos} coldWallets={coldWallets} reconocida={reconocidas.get(g.clave)}
              selected={new Set()} onToggle={() => {}} resaltado={false} seleccionable={false}
              onAssign={dest => asignar(g, dest)} onGuardar={() => setGuardando(g)}
              nota={<p className="text-[11px] text-fg-subtle">Destino actual: {actualesGrupo.map(a => (a ? etiquetaDestino(a, coldWallets) ?? 'Wallet' : 'Pendiente')).join(', ')}</p>} />
          )
        })}
      </div>
      {error && <p role="alert" className="text-xs text-negative">{error}</p>}
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <span className="text-xs text-fg-subtle">{numCambios > 0 ? `${numCambios} retiro${numCambios !== 1 ? 's' : ''} cambiará${numCambios !== 1 ? 'n' : ''} de destino` : 'Sin cambios de destino'}</span>
        <button type="button" onClick={() => { void guardar() }} disabled={enviando} className={buttonClasses('primary', 'sm', 'flex gap-1.5')}>
          <Save size={13} aria-hidden="true" /> {enviando ? 'Guardando…' : numCambios > 0 ? 'Guardar direcciones y destinos' : 'Guardar direcciones'}
        </button>
      </div>

      {guardando && (
        <GuardarDireccionModal key={guardando.clave} grupo={guardando} wallets={coldWallets} redes={redes}
          preseleccion={ultimaWallet} restantes={grupos.filter(g => g.clave !== guardando.clave && !reconocidas.has(g.clave)).length}
          onGuardado={(w, siguiente) => {
            asignar(guardando, w.id)
            setUltimaWallet(w.id)
            const resto = grupos.filter(g => g.clave !== guardando.clave && !reconocidas.has(g.clave))
            setGuardando(siguiente && resto.length > 0 ? resto[0] : null)
          }}
          onClose={() => setGuardando(null)} />
      )}
    </section>
  )
}
