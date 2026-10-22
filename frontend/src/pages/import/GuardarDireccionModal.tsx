import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Network as NetworkIcon, Plus, Sparkles, Wallet } from 'lucide-react'
import { portfolioApi, type Network, type WalletFull } from '../../api/portfolio'
import { buttonClasses, Dropdown, fieldClasses, Modal, ModalBody, ModalFooter, ModalHeader, SegmentedControl } from '../../components/ui'
import { usePrivacyStore } from '../../store/privacyStore'
import { ink } from '../../utils/colors'
import { ColorPicker } from '../settings/wallets/ColorPicker'
import { COLORS } from '../settings/wallets/helpers'
import type { GrupoDireccion } from './direcciones'

const TIPO_LABEL: Record<string, string> = { hardware: 'Hardware', software: 'Software', bank: 'Banco' }

// Guardar la dirección de un retiro en una wallet propia (#320). Una wallet
// agrupa las direcciones de cada red; si aún no hay ninguna, se crea aquí.
// Nunca se guarda nada sin que el usuario lo pida: un retiro puede ir a otra persona.
export function GuardarDireccionModal({ grupo, wallets, redes, preseleccion, restantes, onGuardado, onClose }: {
  grupo: GrupoDireccion
  wallets: WalletFull[]
  redes: Network[]
  preseleccion: string | null
  /** Otras direcciones sin reconocer después de esta: habilita «Guardar y siguiente». */
  restantes: number
  onGuardado: (wallet: { id: string; name: string; color: string }, siguiente: boolean) => void
  onClose: () => void
}) {
  const titleId = useId()
  const queryClient = useQueryClient()
  const oculta = usePrivacyStore(s => s.hidden)
  const primera = wallets.length === 0
  const [modo, setModo] = useState<'existente' | 'nueva'>(primera ? 'nueva' : 'existente')
  const [walletId, setWalletId] = useState<string | null>(preseleccion ?? wallets[0]?.id ?? null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'hardware' | 'software'>('hardware')
  const [color, setColor] = useState(COLORS[wallets.length % COLORS.length])
  const [notas, setNotas] = useState('')
  const [redId, setRedId] = useState<string>(grupo.networkId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const red = redes.find(r => r.id === redId)
  const valido = modo === 'existente' ? !!walletId : nombre.trim().length > 0

  async function guardar(siguiente: boolean) {
    if (!valido || guardando) return
    setGuardando(true)
    setError(null)
    try {
      const r = await portfolioApi.linkWalletAddress({
        ...(modo === 'existente'
          ? { walletId: walletId as string }
          : { newWallet: { name: nombre.trim(), type: tipo, color, notes: notas.trim() || null } }),
        network_id: redId || null,
        address: grupo.address,
      })
      await queryClient.invalidateQueries({ queryKey: ['wallets'] })
      onGuardado(r.wallet, siguiente)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la dirección')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} size="md" closeOnOverlay={false}>
      <ModalHeader titleId={titleId} onClose={onClose}
        icon={<span className="grid place-items-center size-9 rounded-xl bg-brand/10 text-brand-ink" aria-hidden="true">{primera ? <Sparkles size={17} /> : <Wallet size={17} />}</span>}
        title={primera ? 'Crea tu primera wallet' : 'Guardar en mi wallet'}
        subtitle="La próxima importación reconocerá esta dirección y asignará sus retiros solos" />
      <ModalBody className="space-y-5">
        {/* La dirección que se guarda */}
        <div className="rounded-xl border border-border bg-background-tertiary/50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-fg-subtle uppercase tracking-wider font-semibold">
            <NetworkIcon size={11} aria-hidden="true" /> Dirección en {red?.name ?? grupo.network ?? 'red sin identificar'}
          </div>
          <p className="mono text-sm text-fg break-all">{oculta ? '••••••…••••' : grupo.address}</p>
          {!grupo.networkId && (
            <div className="pt-1">
              <Dropdown label="Red de la dirección" value={redId} onChange={setRedId} className="w-full" size="sm"
                options={[{ value: '', label: 'Sin red' }, ...redes.map(r => ({ value: r.id, label: r.name }))]} />
            </div>
          )}
        </div>

        {modo === 'existente' ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-fg-muted mb-2">¿En qué wallet está?</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {wallets.map(w => {
                const redes = [...new Set(w.addresses.map(a => a.network_name).filter(Boolean))] as string[]
                const yaEnRed = !!red && redes.includes(red.name)
                const activa = walletId === w.id
                return (
                  <label key={w.id}
                    className={`relative flex flex-col gap-1.5 rounded-xl border p-3 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-brand/60 ${activa ? 'border-brand bg-brand/5' : 'border-border hover:border-fg-subtle'}`}>
                    <input type="radio" name="wallet" value={w.id} checked={activa} onChange={() => setWalletId(w.id)} className="sr-only" />
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color }} aria-hidden="true" />
                      <span className="text-sm font-medium truncate" style={{ color: activa ? ink(w.color) : undefined }}>{w.name}</span>
                      {activa && <Check size={14} className="ml-auto text-brand shrink-0" aria-hidden="true" />}
                    </span>
                    <span className="text-[11px] text-fg-subtle">{TIPO_LABEL[w.type] ?? w.type} · {redes.length === 0 ? 'sin direcciones' : redes.join(', ')}</span>
                    {yaEnRed && <span className="text-[11px] text-warning">Ya tiene otra dirección en {red?.name}: se añadirá también</span>}
                  </label>
                )
              })}
              <button type="button" onClick={() => setModo('nueva')}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-fg-muted hover:text-fg hover:border-fg-subtle focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
                <Plus size={14} aria-hidden="true" /> Nueva wallet
              </button>
            </div>
          </fieldset>
        ) : (
          <div className="space-y-4">
            {primera && (
              <p className="text-xs text-fg-muted">
                Una wallet agrupa las direcciones de tu Ledger, Tangem, MetaMask… una por red. Empieza por esta y añade las demás cuando aparezcan.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="space-y-1 block">
                <span className="text-xs text-fg-subtle">Nombre *</span>
                <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} autoFocus
                  placeholder="Mi Ledger, Tangem…" className={fieldClasses('md')} />
              </label>
              <div className="space-y-1">
                <span className="text-xs text-fg-subtle block">Tipo</span>
                <SegmentedControl label="Tipo de wallet" value={tipo} onChange={setTipo}
                  options={[{ value: 'hardware', label: 'Hardware' }, { value: 'software', label: 'Software' }]} />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-fg-subtle block">Color</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            <label className="space-y-1 block">
              <span className="text-xs text-fg-subtle">Descripción (opcional)</span>
              <input value={notas} onChange={e => setNotas(e.target.value)} maxLength={500}
                placeholder="Nano X de casa, cold storage…" className={fieldClasses('md')} />
            </label>
            {!primera && (
              <button type="button" onClick={() => setModo('existente')} className="text-xs text-brand hover:underline">
                ← Elegir una wallet que ya tengo
              </button>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-xs text-negative">
            <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter className="flex-wrap">
        <button type="button" onClick={onClose} className={buttonClasses('ghost', 'md')}>Cancelar</button>
        {restantes > 0 && (
          <button type="button" onClick={() => { void guardar(true) }} disabled={!valido || guardando} className={buttonClasses('secondary', 'md')}>
            Guardar y siguiente ({restantes})
          </button>
        )}
        <button type="button" onClick={() => { void guardar(false) }} disabled={!valido || guardando} className={buttonClasses('primary', 'md')}>
          {guardando ? 'Guardando…' : modo === 'nueva' ? 'Crear y guardar' : 'Guardar'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
