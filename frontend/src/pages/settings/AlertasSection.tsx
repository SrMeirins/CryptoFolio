import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BellRing } from 'lucide-react'
import { ApiError } from '../../api/client'
import type { Alerta } from '../../api/alertas'
import { Button, NotApplicable, QueryError, Skeleton, SkeletonGroup } from '../../components/ui'
import { FilaAlerta } from '../../components/alertas/FilaAlerta'
import { FormularioAlerta } from '../../components/alertas/FormularioAlerta'
import { useAlertas } from '../../hooks/useAlertas'
import { parseNumeroLocal } from '../../utils/numeroLocal'
import { SettingsCard } from './SettingsCard'

// Ajustes › Alertas (#519): la alerta de cartera (cambio del valor en 24 h
// mayor que X %, en cualquier sentido, como mucho una vez al día) y la lista
// de alertas de precio con editar, pausar y borrar. Las de precio se crean
// desde el detalle de cada activo en Portfolio. Los avisos llegan a la
// campana en la categoría «Alertas», silenciable en General › Notificaciones.

const mensaje = (e: unknown) => (e instanceof ApiError ? (e.body as { error?: string } | null)?.error ?? e.message : e ? 'No se pudo guardar' : null)

function AlertaCartera({ alerta }: { alerta: Alerta | undefined }) {
  const id = useId()
  const { crear, editar, borrar } = useAlertas()
  const [umbral, setUmbral] = useState(String(alerta?.umbral_pct ?? 5).replace('.', ','))
  const valor = parseNumeroLocal(umbral)
  const invalido = valor === null || !(valor > 0) || valor > 1000
  const guardar = (e: FormEvent) => {
    e.preventDefault()
    if (invalido) return
    if (alerta) editar.mutate({ id: alerta.id, cambios: { umbral_pct: valor!, activa: true } })
    else crear.mutate({ tipo: 'cartera', umbral_pct: valor! })
  }
  const error = mensaje(crear.error ?? editar.error)
  return (
    <SettingsCard title="Alerta de cartera" icon={BellRing} description="Avisa si el valor de tu cartera sube o baja más de un porcentaje en 24 horas, frente al precio de hace 24 h de cada activo y sin contar depósitos ni retiradas. Como mucho, un aviso al día.">
      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3" noValidate>
        <div>
          <label htmlFor={`${id}-umbral`} className="block text-[11px] text-fg-subtle mb-1">Avisar con un cambio mayor que (%)</label>
          <input id={`${id}-umbral`} inputMode="decimal" value={umbral} onChange={e => setUmbral(e.target.value)} aria-invalid={invalido}
            aria-describedby={invalido ? `${id}-error` : undefined}
            className="w-28 rounded-lg border border-border bg-background-card px-2.5 py-1.5 text-sm mono text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand aria-invalid:border-negative" />
        </div>
        <Button type="submit" size="sm" loading={crear.isPending || editar.isPending} disabled={invalido}>{alerta ? 'Guardar' : 'Activar alerta de cartera'}</Button>
      </form>
      {invalido && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-negative-ink">Escribe un porcentaje mayor que 0 y como mucho 1000, por ejemplo 5.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-negative-ink">{error}</p>}
      {alerta && (
        <ul className="mt-3">
          <FilaAlerta alerta={alerta} onPausar={activa => editar.mutate({ id: alerta.id, cambios: { activa } })} onBorrar={() => borrar.mutate(alerta.id)} />
        </ul>
      )}
    </SettingsCard>
  )
}

export function AlertasSection() {
  const { q, alertas, editar, borrar } = useAlertas()
  const [editando, setEditando] = useState<string | null>(null)
  const cartera = alertas.find(a => a.tipo === 'cartera')
  const precio = alertas.filter(a => a.tipo === 'precio')

  if (q.isError) return <QueryError what="las alertas" error={q.error} onRetry={() => void q.refetch()} />
  if (q.isLoading) return <SkeletonGroup label="Cargando las alertas" className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></SkeletonGroup>

  return (
    <div className="space-y-4" data-testid="ajustes-alertas">
      {/* key: al crear o borrar la de cartera, el formulario se vuelve a montar con su valor. */}
      <AlertaCartera key={cartera?.id ?? 'nueva'} alerta={cartera} />
      <SettingsCard title="Alertas de precio" icon={BellRing}
        description="Avisan cuando un activo cruza un precio, una vez o cada vez. Se crean desde el detalle de cada activo en Portfolio.">
        {precio.length === 0 ? (
          <NotApplicable>Aún no hay alertas de precio. <Link to="/portfolio" className="text-brand-ink hover:underline">Crea una desde un activo en Portfolio</Link>.</NotApplicable>
        ) : (
          <ul className="space-y-1.5">
            {precio.map(a => editando === a.id ? (
              <li key={a.id}>
                <FormularioAlerta activo={a.activo ?? ''} guardando={editar.isPending} error={mensaje(editar.error)}
                  inicial={{ sentido: a.sentido ?? 'por_encima', precio: a.precio ?? 0, moneda: a.moneda, repeticion: a.repeticion }}
                  onCancelar={() => { setEditando(null); editar.reset() }}
                  onGuardar={v => editar.mutate({ id: a.id, cambios: { ...v, activa: true } }, { onSuccess: () => setEditando(null) })} />
              </li>
            ) : (
              <FilaAlerta key={a.id} alerta={a} onEditar={() => setEditando(a.id)}
                onPausar={activa => editar.mutate({ id: a.id, cambios: { activa } })} onBorrar={() => borrar.mutate(a.id)} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-fg-subtle">Los avisos llegan a la campana en la categoría «Alertas»; puedes silenciarla en <Link to="/settings?tab=general" className="text-brand-ink hover:underline">General</Link>.</p>
      </SettingsCard>
    </div>
  )
}
