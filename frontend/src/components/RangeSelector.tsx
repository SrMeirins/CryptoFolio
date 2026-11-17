import { useEffect, type RefObject } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DateRangePicker } from './DateRangePicker'
import { Hint, SegmentedControl, iconButtonClasses } from './ui'
import {
  RANGO_PRESETS, anioVisible, hoyApp, irAHoy, resolverRango, saltarAnio, type RangoPreset, type RangoValor,
} from '../utils/rangoGrafico'

// Selector de rango común de los gráficos (#508): rangos predefinidos con los
// mismos nombres en todos, rango personalizado (con «Hasta hoy» dentro del
// calendario; un rango que termina hoy se mantiene al día), saltos al año
// anterior o siguiente (Re Pág y Av Pág) y la tecla T, que lleva el rango a
// terminar hoy con la misma duración. Las teclas solo
// actúan con el foco dentro del gráfico (o, si nada tiene el foco, en el
// gráfico principal de la página) y nunca mientras se escribe en un campo.

/** No se navega mientras se escribe ni con modificadores. */
function escribiendo(e: KeyboardEvent): boolean {
  const t = e.target
  return e.ctrlKey || e.metaKey || e.altKey
    || (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)))
}

export function RangeSelector({ value, onChange, presets, defecto, minDate, label, scopeRef, primario = false, className = '' }: {
  value: RangoValor
  onChange: (v: RangoValor) => void
  /** Rangos predefinidos que tiene sentido ofrecer en este gráfico. */
  presets: readonly RangoPreset[]
  /** Rango al que vuelve al borrar el personalizado. */
  defecto: RangoValor
  /** Primer día con datos: límite de los saltos de año y del calendario. */
  minDate?: string | null
  /** Nombre del gráfico para el lector de pantalla, p. ej. «gráfico de evolución». */
  label: string
  /** Panel del gráfico: las teclas actúan con el foco dentro de él. */
  scopeRef?: RefObject<HTMLElement | null>
  /** Gráfico principal de la página: también responde si nada tiene el foco. */
  primario?: boolean
  className?: string
}) {
  const today = hoyApp()
  const minYear = minDate ? Number(minDate.slice(0, 4)) : Number(today.slice(0, 4)) - 10
  const anio = anioVisible(value, today)
  const anterior = saltarAnio(value, today, -1, minYear)
  const siguiente = saltarAnio(value, today, 1, minYear)
  const aHoy = irAHoy(value, today)
  const opciones = RANGO_PRESETS.filter(p => presets.includes(p.value))
  const custom = value.tipo === 'rango' ? resolverRango(value, today) : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (escribiendo(e)) return
      const dentro = scopeRef?.current?.contains(e.target as Node) ?? false
      const sinFoco = document.activeElement === document.body || document.activeElement === null
      if (!dentro && !(primario && sinFoco)) return
      const destino = e.key === 't' || e.key === 'T' ? aHoy
        : e.key === 'PageUp' ? anterior
        : e.key === 'PageDown' ? siguiente
        : undefined
      if (destino === undefined) return
      e.preventDefault()
      if (destino) onChange(destino)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [scopeRef, primario, aHoy, anterior, siguiente, onChange])

  return (
    // min-w-0 y max-w-full: en pantallas estrechas la fila se ajusta y los rangos se desplazan dentro de su caja.
    <div className={`flex items-center gap-2 flex-wrap min-w-0 max-w-full ${className}`} role="group" aria-label={`Rango del ${label}`}
      aria-keyshortcuts="T PageUp PageDown" data-testid="range-selector">
      <div className="flex items-center gap-0.5" role="group" aria-label="Año">
        <Hint label="Año anterior (Re Pág)">
          <button type="button" onClick={() => anterior && onChange(anterior)} disabled={!anterior}
            className={iconButtonClasses('sm')} aria-label={`Año anterior: ${anio - 1}`} aria-keyshortcuts="PageUp">
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
        </Hint>
        <span className="text-xs mono tabular-nums text-fg-muted w-10 text-center" aria-live="polite" aria-label={`Año ${anio}`}>{anio}</span>
        <Hint label="Año siguiente (Av Pág)">
          <button type="button" onClick={() => siguiente && onChange(siguiente)} disabled={!siguiente}
            className={iconButtonClasses('sm')} aria-label={`Año siguiente: ${anio + 1}`} aria-keyshortcuts="PageDown">
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </Hint>
      </div>
      {/* En pantallas estrechas los rangos se desplazan dentro de su caja (#499). */}
      <div className="min-w-0 max-w-full overflow-x-auto py-0.5">
        <SegmentedControl label={`Rango predefinido del ${label}`} variant="accent"
          value={(value.tipo === 'preset' ? value.preset : '') as RangoPreset}
          onChange={p => onChange({ tipo: 'preset', preset: p })}
          options={opciones.map(o => ({ value: o.value, label: o.label, title: o.title }))} />
      </div>
      <DateRangePicker placeholder="Rango" align="right" max={today}
        from={custom?.from ?? ''} to={custom?.to ?? ''}
        onChange={(from, to) => {
          if (!from && !to) { onChange(defecto); return }
          // Un rango que termina hoy se mantiene al día (rueda con los días).
          const fin = to || from
          onChange({ tipo: 'rango', from, to: fin, hastaHoy: fin >= today })
        }} />
    </div>
  )
}
