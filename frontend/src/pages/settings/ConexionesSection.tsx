import { useEffect, useId, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { ExternalLink, KeyRound, LineChart } from 'lucide-react'
import { ApiError } from '../../api/client'
import type { Comprobacion, EstadoServicio, PlanCoinGecko } from '../../api/conexiones'
import { Badge, Button, Notice, QueryError, SegmentedControl, Skeleton, SkeletonGroup, fieldClasses } from '../../components/ui'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useConexiones } from '../../hooks/useConexiones'
import { estadoClave, mensajeComprobacion, usoClave } from '../../utils/conexiones'
import { SettingsCard } from './SettingsCard'

// Ajustes › Conexiones (versión 1.0): claves de API de Etherscan, Blockfrost,
// Subscan y CoinGecko. Se comprueban al guardar y se guardan cifradas en este
// equipo; nunca se muestra ningún carácter de una clave guardada. En la app de
// escritorio es el único sitio para ponerlas (no hay .env).

const PLANES = [
  { value: 'demo', label: 'Demo (gratis)' },
  { value: 'pro', label: 'Pro' },
] as const

const mensajeError = (e: unknown) =>
  e instanceof ApiError ? (e.body as { error?: string } | null)?.error ?? e.message : 'No se pudo guardar la clave'

const TONO_RESULTADO = { ok: 'text-positive-ink', aviso: 'text-warning-ink', error: 'text-negative-ink' } as const

function TarjetaServicio({ s, index }: { s: EstadoServicio; index: number }) {
  const id = useId()
  const { guardar, quitar, probar } = useConexiones()
  const [clave, setClave] = useState('')
  const [plan, setPlan] = useState<PlanCoinGecko>(s.plan ?? 'demo')
  const [resultado, setResultado] = useState<Comprobacion | 'ilegible' | null | undefined>(undefined)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const estado = estadoClave(s)
  const guardada = s.estado === 'configurada' || s.estado === 'ilegible'
  const hayClave = guardada || s.estado === 'entorno'

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!clave.trim()) return
    setResultado(undefined)
    guardar.mutate({ id: s.id, clave: clave.trim(), plan: s.id === 'coingecko' ? plan : undefined }, {
      onSuccess: r => { setClave(''); setResultado(r.comprobacion) },
    })
  }
  const comprobar = () => {
    setResultado(undefined)
    guardar.reset()
    probar.mutate(s.id, { onSuccess: r => setResultado(r.comprobacion) })
  }

  const mensaje = resultado !== undefined ? mensajeComprobacion(resultado) : null
  const error = guardar.isError ? mensajeError(guardar.error) : probar.isError ? 'No se pudo probar la clave' : null

  return (
    <div id={`conexion-${s.id}`} className="scroll-mt-4">
      <SettingsCard index={index} title={s.nombre} icon={s.red ? KeyRound : LineChart}
        status={<Badge tone={estado.tono}>{estado.texto}</Badge>}
        description={usoClave(s)}
        action={
          <a href={s.enlace} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-ink hover:underline focus-visible:outline-2 focus-visible:outline-brand rounded-sm">
            Conseguir una clave gratis<ExternalLink size={12} aria-hidden="true" />
            <span className="sr-only"> de {s.nombre} (se abre en otra pestaña)</span>
          </a>
        }>
        {s.estado === 'ilegible' && (
          <Notice tipo="aviso" compact>
            La clave guardada se cifró con otra clave maestra y ya no se puede usar. Vuelve a introducirla.
          </Notice>
        )}
        {s.estado === 'entorno' && (
          <p className="text-xs text-fg-subtle">Se usa la clave del archivo .env. Si guardas una aquí, tendrá prioridad.</p>
        )}
        <div className="space-y-2">
        <form onSubmit={enviar} className="flex flex-wrap items-end gap-3" noValidate>
          <div className="flex-1 min-w-56">
            <label htmlFor={`${id}-clave`} className="block text-[11px] text-fg-subtle mb-1">
              {guardada ? 'Reemplazar por una clave nueva' : 'Clave de API'}
            </label>
            <input id={`${id}-clave`} type="password" autoComplete="off" spellCheck={false} value={clave}
              onChange={e => setClave(e.target.value)} placeholder="Pega aquí la clave"
              className={fieldClasses('md', false, 'w-full mono text-xs')} />
          </div>
          {s.id === 'coingecko' && (
            <SegmentedControl label={`Plan de ${s.nombre}`} size="sm" options={PLANES} value={plan} onChange={setPlan} />
          )}
          <Button type="submit" size="sm" loading={guardar.isPending} disabled={!clave.trim()}>
            {guardar.isPending ? 'Comprobando…' : 'Comprobar y guardar'}
          </Button>
          {hayClave && (
            <Button type="button" size="sm" variant="secondary" loading={probar.isPending} onClick={comprobar}>Probar</Button>
          )}
          {guardada && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmarQuitar(true)}>Quitar</Button>
          )}
        </form>
        <div aria-live="polite">
          {mensaje && <p className={`text-xs ${TONO_RESULTADO[mensaje.tipo]}`}>{mensaje.texto}</p>}
        </div>
        {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
        </div>
      </SettingsCard>
      {confirmarQuitar && (
        <ConfirmDialog danger title={`Quitar la clave de ${s.nombre}`}
          message={s.red
            ? `Sin ella, el saldo de tus direcciones de ${s.red} no se comprobará (salvo que haya una en el archivo .env).`
            : 'Sin ella, CoinGecko se consultará sin clave, más despacio (salvo que haya una en el archivo .env).'}
          confirmLabel="Quitar la clave"
          onCancel={() => setConfirmarQuitar(false)}
          onConfirm={() => { setConfirmarQuitar(false); setResultado(undefined); quitar.mutate(s.id) }} />
      )}
    </div>
  )
}

export function ConexionesSection() {
  const { q } = useConexiones()
  const { hash } = useLocation()

  // Atajo desde una dirección de wallet (#conexion-etherscan): lleva a su tarjeta.
  useEffect(() => {
    if (!q.data || !hash.startsWith('#conexion-')) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView({ block: 'start' })
    el?.querySelector('input')?.focus({ preventScroll: true })
  }, [q.data, hash])

  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} what="el estado de las claves" />
  if (!q.data) {
    return (
      <SkeletonGroup label="Cargando las claves de API" className="space-y-3">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
      </SkeletonGroup>
    )
  }
  return (
    <div className="space-y-3">
      {!q.data.claveMaestra && (
        <Notice tipo="aviso" title="Falta la clave maestra">
          Sin WALLET_SYNC_ENCRYPTION_KEY no se pueden guardar claves. Defínela en el archivo .env (genera una con
          {' '}<code className="mono">openssl rand -base64 32</code>) y reinicia.
        </Notice>
      )}
      <Notice tipo="informacion" compact>
        Las claves se comprueban con cada servicio y se guardan cifradas en este equipo. No se incluyen en las copias de seguridad.
      </Notice>
      {q.data.servicios.map((s, i) => <TarjetaServicio key={s.id} s={s} index={i} />)}
    </div>
  )
}
