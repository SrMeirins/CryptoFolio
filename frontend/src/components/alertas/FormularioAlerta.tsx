import { useId, useState, type FormEvent } from 'react'
import type { RepeticionAlerta, SentidoAlerta } from '../../api/alertas'
import { Button, SegmentedControl } from '../ui'
import { parseNumeroLocal } from '../../utils/numeroLocal'

// Formulario de una alerta de precio (#519), para crearla o editarla: sentido,
// precio (en formato español), su moneda y si avisa una vez o cada vez que lo
// cruza. El error se dice junto al campo y en un texto anunciado.

export interface ValoresAlerta { sentido: SentidoAlerta; precio: number; moneda: 'EUR' | 'USD'; repeticion: RepeticionAlerta }

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumSignificantDigits: 8 })

export function FormularioAlerta({ activo, inicial, onGuardar, onCancelar, guardando = false, error = null }: {
  activo: string
  inicial: ValoresAlerta
  onGuardar: (v: ValoresAlerta) => void
  onCancelar: () => void
  guardando?: boolean
  /** Error del servidor al guardar. */
  error?: string | null
}) {
  const id = useId()
  const [sentido, setSentido] = useState<SentidoAlerta>(inicial.sentido)
  const [precio, setPrecio] = useState(fmt(inicial.precio))
  const [repeticion, setRepeticion] = useState<RepeticionAlerta>(inicial.repeticion)
  const [tocado, setTocado] = useState(false)
  const valor = parseNumeroLocal(precio)
  const invalido = valor === null || !(valor > 0)
  const simbolo = inicial.moneda === 'EUR' ? '€' : '$'

  function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (invalido) return
    onGuardar({ sentido, precio: valor!, moneda: inicial.moneda, repeticion })
  }

  return (
    <form onSubmit={enviar} aria-label={`Alerta de precio de ${activo}`} className="space-y-3 rounded-xl border border-border bg-overlay/2 p-3" noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="block text-[11px] text-fg-subtle mb-1">Avisar cuando el precio esté</span>
          <SegmentedControl label="Sentido de la alerta" value={sentido} onChange={setSentido}
            options={[{ value: 'por_encima', label: 'Por encima de' }, { value: 'por_debajo', label: 'Por debajo de' }]} />
        </div>
        <div>
          <label htmlFor={`${id}-precio`} className="block text-[11px] text-fg-subtle mb-1">Precio ({simbolo})</label>
          <input id={`${id}-precio`} inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} onBlur={() => setTocado(true)}
            aria-invalid={tocado && invalido} aria-describedby={tocado && invalido ? `${id}-error` : undefined}
            className="w-36 rounded-lg border border-border bg-background-card px-2.5 py-1.5 text-sm mono text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand aria-invalid:border-negative" />
        </div>
        <div>
          <span className="block text-[11px] text-fg-subtle mb-1">Avisar</span>
          <SegmentedControl label="Repetición de la alerta" value={repeticion} onChange={setRepeticion}
            options={[{ value: 'una_vez', label: 'Una vez' }, { value: 'cada_vez', label: 'Cada vez' }]} />
        </div>
      </div>
      {tocado && invalido && <p id={`${id}-error`} role="alert" className="text-xs text-negative-ink">Escribe un precio mayor que 0, por ejemplo 0,65.</p>}
      {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
      <p className="text-[11px] text-fg-subtle">
        {repeticion === 'una_vez' ? 'Avisa la primera vez que lo cruce y se desactiva.' : 'Avisa cada vez que lo cruce; vuelve a vigilar cuando el precio regresa al otro lado (con un margen del 1 %).'}
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar alerta'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}
