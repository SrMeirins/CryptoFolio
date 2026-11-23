import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { portfolioApi } from '../../api/portfolio'
import { Button, iconButtonClasses, NotApplicable } from '../../components/ui'
import { FormularioMeta } from '../../components/metas/FormularioMeta'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { useMetas } from '../../hooks/useMetas'
import { formatAmount, formatMoney } from '../../utils/format'
import { MAX_METAS, TIPO_META_TEXTO, type Meta } from '../../utils/metas'
import { SettingsCard } from './SettingsCard'

// Ajustes › General › Metas de inversión (#520): la misma lista que la franja
// del Dashboard, con crear, editar y borrar. El progreso se ve en el Dashboard.

const mensaje = (e: unknown) => (e instanceof ApiError ? (e.body as { error?: string } | null)?.error ?? e.message : e ? 'No se pudo guardar la meta' : null)

function objetivoTexto(m: Meta): string {
  return m.tipo === 'cantidad' ? `${formatAmount(m.objetivo)} ${m.activo}` : formatMoney(m.objetivo, m.moneda)
}

function FilaMeta({ meta, onEditar, onBorrar }: { meta: Meta; onEditar: () => void; onBorrar: () => void }) {
  const [confirmar, setConfirmar] = useState(false)
  useEffect(() => {
    if (!confirmar) return
    const t = setTimeout(() => setConfirmar(false), 4000)
    return () => clearTimeout(t)
  }, [confirmar])
  const accion = iconButtonClasses('sm')
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-background-card px-3 py-2" data-testid="fila-meta">
      <span className="flex-1 min-w-0 text-sm">
        <span className="block font-semibold text-fg truncate">{meta.nombre}</span>
        <span className="block text-[11px] text-fg-subtle">
          {meta.tipo === 'cantidad' ? `Cantidad de ${meta.activo}` : TIPO_META_TEXTO[meta.tipo]}: <span className="mono">{objetivoTexto(meta)}</span>
        </span>
      </span>
      <span className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={onEditar} className={accion} aria-label={`Editar la meta ${meta.nombre}`}><Pencil size={14} aria-hidden="true" /></button>
        {confirmar ? (
          <button type="button" onClick={onBorrar} className="rounded-md px-2 py-1 text-xs font-semibold text-negative-ink bg-negative/10 hover:bg-negative/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            Confirmar borrado
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmar(true)} className={accion} aria-label={`Borrar la meta ${meta.nombre}`}><Trash2 size={14} aria-hidden="true" /></button>
        )}
      </span>
    </li>
  )
}

export function MetasCard({ index }: { index: number }) {
  const { metas, guardar, guardarMeta, borrarMeta } = useMetas()
  const currency = useCurrency()
  const [editando, setEditando] = useState<string | null>(null)
  // consulta de fondo (#498): sin lotes, la meta de cantidad no tiene activos que elegir y el formulario lo dice.
  const { data: lots = [] } = useQuery({ queryKey: ['fifo-lots'], queryFn: portfolioApi.getLots })
  const activos = [...new Set(lots.map(l => l.asset))].sort()
  const cerrar = () => { setEditando(null); guardar.reset() }
  const formulario = (id: string | null) => (
    <FormularioMeta inicial={metas.find(m => m.id === id)} currency={currency} activos={activos}
      guardando={guardar.isPending} error={mensaje(guardar.error)} onCancelar={cerrar}
      onGuardar={m => guardarMeta(m, { onSuccess: () => setEditando(null) })} />
  )

  return (
    <SettingsCard index={index} icon={Target} title="Metas de inversión"
      description={<>Hasta {MAX_METAS} metas con su progreso en vivo bajo las métricas del <Link to="/" className="text-brand-ink hover:underline">Dashboard</Link>: valor total, aportado este año o cantidad de un activo. Con el modo privacidad, solo se ve el porcentaje.</>}>
      <div className="space-y-2" data-testid="ajustes-metas">
        {metas.length === 0 && editando !== 'nueva' && <NotApplicable>Aún no hay metas.</NotApplicable>}
        {metas.length > 0 && (
          <ul className="space-y-1.5">
            {metas.map(m => editando === m.id ? <li key={m.id}>{formulario(m.id)}</li> : (
              <FilaMeta key={m.id} meta={m} onEditar={() => { guardar.reset(); setEditando(m.id) }} onBorrar={() => borrarMeta(m.id)} />
            ))}
          </ul>
        )}
        {editando === 'nueva' ? formulario(null) : metas.length < MAX_METAS && (
          <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true" />} onClick={() => { guardar.reset(); setEditando('nueva') }}>Añadir meta</Button>
        )}
        {guardar.isError && editando === null && <p role="alert" className="text-xs text-negative-ink">{mensaje(guardar.error)}</p>}
      </div>
    </SettingsCard>
  )
}
