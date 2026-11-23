import { useEffect, useState } from 'react'
import { BellRing, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import type { Alerta } from '../../api/alertas'
import { CryptoIcon } from '../CryptoIcon'
import { badgeClasses, iconButtonClasses } from '../ui'
import { describirAlerta, ESTADO_TEXTO, estadoAlerta } from '../../utils/alertas'
import { formatPrice, type Currency } from '../../utils/format'

// Una alerta en una lista (#519): qué vigila, su estado, el último disparo y
// las acciones (editar si se pasa `onEditar`, pausar o reanudar y borrar con
// confirmación). Común a Ajustes y al detalle del activo.

const TONO = { vigilando: 'positive', pausada: 'neutral', disparada: 'brand', rearmando: 'warning' } as const
const CUANDO = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function FilaAlerta({ alerta, mostrarActivo = true, onPausar, onBorrar, onEditar }: {
  alerta: Alerta
  mostrarActivo?: boolean
  onPausar: (activa: boolean) => void
  onBorrar: () => void
  onEditar?: () => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  // La confirmación de borrar caduca a los 4 s si no se pulsa.
  useEffect(() => {
    if (!confirmar) return
    const t = setTimeout(() => setConfirmar(false), 4000)
    return () => clearTimeout(t)
  }, [confirmar])
  const estado = estadoAlerta(alerta)
  const nombre = alerta.tipo === 'cartera' ? 'Cartera' : alerta.activo ?? ''
  const ultimo = alerta.ultimo_disparo_at && alerta.ultimo_valor !== null
    ? `Último aviso: ${CUANDO.format(new Date(alerta.ultimo_disparo_at)).replace('.', '')} a ${alerta.tipo === 'cartera'
      ? `${alerta.ultimo_valor > 0 ? '+' : ''}${String(Math.round(alerta.ultimo_valor * 10) / 10).replace('.', ',')} %`
      : formatPrice(alerta.ultimo_valor, alerta.moneda as Currency)}`
    : null
  const accion = iconButtonClasses('sm')
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-background-card px-3 py-2" data-testid="fila-alerta">
      {mostrarActivo && (
        <span aria-hidden="true" className="shrink-0">
          {alerta.tipo === 'cartera' ? <span className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-brand-ink"><BellRing size={14} /></span> : <CryptoIcon symbol={nombre} size={28} />}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap text-sm">
          {mostrarActivo && <span className="font-semibold text-fg">{nombre}</span>}
          <span className="text-fg-muted">{describirAlerta(alerta)}</span>
          <span className={badgeClasses(TONO[estado], 'sm')}>{ESTADO_TEXTO[estado]}</span>
        </span>
        {ultimo && <span className="block text-[11px] text-fg-subtle mt-0.5">{ultimo}</span>}
      </span>
      <span className="flex items-center gap-0.5 shrink-0">
        {onEditar && (
          <button type="button" onClick={onEditar} className={accion} aria-label={`Editar la alerta de ${nombre}`}><Pencil size={14} aria-hidden="true" /></button>
        )}
        <button type="button" onClick={() => onPausar(!alerta.activa)} className={accion}
          aria-label={`${alerta.activa ? 'Pausar' : 'Reanudar'} la alerta de ${nombre}`}>
          {alerta.activa ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        </button>
        {confirmar ? (
          <button type="button" onClick={onBorrar} className="rounded-md px-2 py-1 text-xs font-semibold text-negative-ink bg-negative/10 hover:bg-negative/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            Confirmar borrado
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmar(true)} className={accion} aria-label={`Borrar la alerta de ${nombre}`}><Trash2 size={14} aria-hidden="true" /></button>
        )}
      </span>
    </li>
  )
}
