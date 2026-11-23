import { useEffect, useState, type CSSProperties } from 'react'
import { CheckCircle2, Landmark, Pencil, Trash2, Wallet } from 'lucide-react'
import { AnimatedNumber } from '../../../components/AnimatedNumber'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { AnilloMeta } from '../../../components/metas/AnilloMeta'
import { iconButtonClasses } from '../../../components/ui'
import { useFlashOnChange } from '../../../hooks/useFlashOnChange'
import { formatAmount, formatMoney, type Currency } from '../../../utils/format'
import { T } from '../../../utils/colors'
import { COLOR_META, TIPO_META_TEXTO, type Meta, type ProgresoMeta } from '../../../utils/metas'

// Una meta en la franja del Dashboard (#520), con el estilo de las tarjetas de
// métricas (#407): borde degradado del color de su tipo, brillo y elevación al
// pasar y entrada escalonada. Anillo de progreso con el porcentaje, «X de Y» y
// cuánto falta, en vivo: las cifras se mueven con cada precio y destellan al
// subir o bajar, como las KPI. Con privacidad, solo el porcentaje. Cumplida se
// dice con icono y texto, no solo con el color.

/** Cifra en vivo: cuenta hasta su valor y destella al cambiar. */
function CifraViva({ valor, formato, className = '' }: { valor: number; formato: (v: number) => string; className?: string }) {
  const dir = useFlashOnChange(valor)
  return (
    <span className={`mono tabular-nums rounded ${dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-down' : ''} ${className}`}>
      <AnimatedNumber value={valor} format={formato} duration={400} />
    </span>
  )
}

export function TarjetaMeta({ meta, progreso, currency, oculto, indice = 0, onEditar, onBorrar }: {
  meta: Meta
  /** Moneda de visualización: la del valor en vivo de una meta de cantidad. */
  currency: Currency
  /** null si aún no se puede medir (sin precios, sin tipo de cambio o cargando). */
  progreso: ProgresoMeta | null
  oculto: boolean
  /** Posición en la franja, para la entrada escalonada. */
  indice?: number
  onEditar: () => void
  onBorrar: () => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  // La confirmación de borrar caduca a los 4 s si no se pulsa.
  useEffect(() => {
    if (!confirmar) return
    const t = setTimeout(() => setConfirmar(false), 4000)
    return () => clearTimeout(t)
  }, [confirmar])

  const cumplida = progreso?.cumplida ?? false
  const color = cumplida ? T.positive : COLOR_META[meta.tipo]
  const moneda = progreso?.moneda ?? null
  const formato = (n: number) => (moneda ? formatMoney(n, moneda) : `${formatAmount(n)} ${meta.tipo === 'cantidad' ? meta.activo : ''}`.trim())
  const tipo = meta.tipo === 'cantidad' ? `Cantidad de ${meta.activo}` : TIPO_META_TEXTO[meta.tipo]
  const Icono = meta.tipo === 'aportado' ? Landmark : Wallet
  const accion = iconButtonClasses('sm')

  return (
    <li className="stat-card stat-card-in relative rounded-2xl p-px min-w-0" data-testid="tarjeta-meta"
      style={{ '--card': color, animationDelay: `${indice * 60}ms` } as CSSProperties}>
      <div className="stat-card-body h-full rounded-[15px] p-4 flex items-center gap-4">
        <AnilloMeta progreso={progreso} nombre={meta.nombre} color={color} />
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 pr-14 text-[11px] text-fg-subtle uppercase tracking-widest">
            {meta.tipo === 'cantidad'
              ? <span aria-hidden="true" className="shrink-0"><CryptoIcon symbol={meta.activo} size={14} /></span>
              : <Icono size={12} aria-hidden="true" className="shrink-0" style={{ color }} />}
            <span className="truncate">{tipo}</span>
          </p>
          <p className="mt-1 text-[15px] font-semibold text-fg truncate">{meta.nombre}</p>
          {progreso && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
              {!oculto && (
                <span>
                  <CifraViva valor={progreso.actual} formato={formato} className="text-fg" /> de <span className="mono">{formato(progreso.objetivo)}</span>
                  {progreso.valorActual !== null && <> (<CifraViva valor={progreso.valorActual} formato={v => formatMoney(v, currency)} />)</>}
                </span>
              )}
              {cumplida ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-positive/12 px-2 py-0.5 font-semibold text-positive-ink">
                  <CheckCircle2 size={12} aria-hidden="true" />Cumplida
                </span>
              ) : !oculto && (
                <span className="rounded-full bg-overlay/6 px-2 py-0.5">Faltan <CifraViva valor={progreso.faltan} formato={formato} className="text-fg" /></span>
              )}
            </div>
          )}
          {!progreso && <p className="mt-1.5 text-xs text-fg-subtle">Calculando el progreso…</p>}
        </div>
      </div>
      <span className="absolute z-10 top-2 right-2 flex items-center gap-0.5">
        <button type="button" onClick={onEditar} className={accion} aria-label={`Editar la meta ${meta.nombre}`}><Pencil size={14} aria-hidden="true" /></button>
        {confirmar ? (
          <button type="button" onClick={onBorrar} className="rounded-md px-2 py-1 text-xs font-semibold text-negative-ink bg-background-card ring-1 ring-negative/30 hover:bg-negative/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            Confirmar borrado
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmar(true)} className={accion} aria-label={`Borrar la meta ${meta.nombre}`}><Trash2 size={14} aria-hidden="true" /></button>
        )}
      </span>
    </li>
  )
}
