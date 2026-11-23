import { useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../api/client'
import { portfolioApi } from '../../../api/portfolio'
import { FormularioMeta } from '../../../components/metas/FormularioMeta'
import { useDisplayMarket } from '../../../hooks/useDisplayMarket'
import { useMetas } from '../../../hooks/useMetas'
import { usePrivacyStore } from '../../../store/privacyStore'
import { localToday } from '../../../utils/pnlChart'
import { MAX_METAS, progresoMeta, type ContextoMetas } from '../../../utils/metas'
import type { AssetValuation } from '../../../utils/portfolioValuation'
import { TarjetaMeta } from './TarjetaMeta'

// Franja de metas bajo los KPI del Dashboard (#520): hasta seis metas con su
// progreso en vivo, y crear, editar y borrar desde aquí (también en Ajustes ›
// General). Sin metas, solo un enlace discreto para añadir la primera.

const mensaje = (e: unknown) => (e instanceof ApiError ? (e.body as { error?: string } | null)?.error ?? e.message : e ? 'No se pudo guardar la meta' : null)

export function FranjaMetas({ valorTotal, assets }: {
  /** Valor total en vivo en la moneda de visualización; null sin precios. */
  valorTotal: number | null
  assets: readonly AssetValuation[]
}) {
  const { metas, cargando, guardar, guardarMeta, borrarMeta } = useMetas()
  const { currency, rate } = useDisplayMarket()
  const oculto = usePrivacyStore(s => s.hidden)
  const [editando, setEditando] = useState<string | null>(null)
  const anio = Number(localToday().slice(0, 4))
  const hayAportado = metas.some(m => m.tipo === 'aportado')
  // consulta de fondo (#498): sin el flujo del año, la meta de aportado dice «Calculando» y el resto sigue.
  const flujoQ = useQuery({
    queryKey: ['eur-flow', currency, anio],
    queryFn: () => portfolioApi.getEurFlow(currency, anio),
    enabled: hayAportado,
    staleTime: 60_000,
  })

  if (cargando) return null
  const cripto = assets.filter(a => a.kind === 'crypto')
  const ctx: ContextoMetas = {
    currency,
    rate,
    valorTotal,
    aportadoAnio: flujoQ.data && (flujoQ.data.currency ?? 'EUR') === currency ? flujoQ.data.netFromBank : null,
    cantidades: Object.fromEntries(cripto.map(a => [a.asset, a.quantity])),
    valores: Object.fromEntries(cripto.filter(a => a.price !== null).map(a => [a.asset, a.value])),
  }
  const activos = cripto.map(a => a.asset).sort()
  const cerrar = () => { setEditando(null); guardar.reset() }
  const formulario = (id: string | null) => (
    <FormularioMeta inicial={metas.find(m => m.id === id)} currency={currency} activos={activos}
      vista={m => progresoMeta(m, ctx)}
      guardando={guardar.isPending} error={mensaje(guardar.error)} onCancelar={cerrar}
      onGuardar={m => guardarMeta(m, { onSuccess: () => setEditando(null) })} />
  )

  if (metas.length === 0) {
    return editando === 'nueva' ? (
      <section aria-label="Metas de inversión">{formulario(null)}</section>
    ) : (
      <div className="-mt-3">
        <button type="button" onClick={() => setEditando('nueva')}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-fg-subtle hover:text-brand-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <Target size={14} aria-hidden="true" />Añadir una meta
        </button>
      </div>
    )
  }

  return (
    <section aria-labelledby="metas-titulo" className="space-y-3" data-testid="franja-metas">
      <div className="flex items-center gap-2">
        <span className="size-7 rounded-lg flex items-center justify-center shrink-0 bg-brand/15" aria-hidden="true">
          <Target size={14} className="text-brand-ink" />
        </span>
        <h2 id="metas-titulo" className="text-sm font-semibold text-fg">Metas</h2>
        <span className="text-xs text-fg-subtle">{metas.length} de {MAX_METAS}</span>
      </div>
      <ul className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {metas.map((m, i) => editando === m.id ? (
          <li key={m.id} className="col-span-full">{formulario(m.id)}</li>
        ) : (
          <TarjetaMeta key={m.id} meta={m} indice={i} currency={currency} progreso={progresoMeta(m, ctx)} oculto={oculto}
            onEditar={() => { guardar.reset(); setEditando(m.id) }} onBorrar={() => borrarMeta(m.id)} />
        ))}
        {metas.length < MAX_METAS && editando !== 'nueva' && (
          <li className="min-h-24">
            <button type="button" onClick={() => { guardar.reset(); setEditando('nueva') }}
              className="group size-full min-h-24 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-fg-subtle transition-colors hover:border-brand/60 hover:text-brand-ink hover:bg-brand/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <span className="size-7 rounded-full flex items-center justify-center bg-overlay/6 transition-colors group-hover:bg-brand/15" aria-hidden="true">
                <Plus size={14} />
              </span>
              Añadir meta
            </button>
          </li>
        )}
        {editando === 'nueva' && <li className="col-span-full">{formulario(null)}</li>}
      </ul>
      {guardar.isError && editando === null && <p role="alert" className="text-xs text-negative-ink">{mensaje(guardar.error)}</p>}
    </section>
  )
}
