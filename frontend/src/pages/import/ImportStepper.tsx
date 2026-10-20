import { Check } from 'lucide-react'
import { PASOS, puedeIrA, type Paso } from './wizard'

// Indicador de pasos del asistente (#318): Subir → Revisar → Importar → Listo.
// Los pasos anteriores se pueden pulsar para volver; en móvil, una línea compacta.
export function ImportStepper({ actual, onIr }: { actual: Paso; onIr: (p: Paso) => void }) {
  const idx = PASOS.findIndex(p => p.id === actual)
  return (
    <nav aria-label="Pasos de la importación">
      <p className="sm:hidden text-sm text-fg-muted">
        Paso <span className="font-semibold text-fg">{idx + 1}</span> de {PASOS.length} · <span className="text-fg">{PASOS[idx].label}</span>
      </p>
      <ol className="hidden sm:flex items-center gap-2">
        {PASOS.map((p, i) => {
          const hecho = i < idx, activo = i === idx
          const clicable = puedeIrA(p.id, actual)
          const circulo = (
            <span className={`grid place-items-center size-7 rounded-full text-xs font-semibold shrink-0 transition-colors ${
              activo ? 'bg-brand text-white ring-4 ring-brand/20' : hecho ? 'bg-positive/15 text-positive' : 'bg-overlay/8 text-fg-subtle'}`}>
              {hecho ? <Check size={14} aria-hidden="true" /> : i + 1}
            </span>
          )
          const etiqueta = <span className={`text-sm ${activo ? 'font-semibold text-fg' : hecho ? 'text-fg-muted' : 'text-fg-subtle'}`}>{p.label}</span>
          return (
            <li key={p.id} className="flex items-center gap-2 flex-1 last:flex-none" aria-current={activo ? 'step' : undefined}>
              {clicable ? (
                <button type="button" onClick={() => onIr(p.id)} aria-label={`Volver al paso ${p.label}`}
                  className="flex items-center gap-2 rounded-lg px-1 -mx-1 hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
                  {circulo}{etiqueta}
                </button>
              ) : <span className="flex items-center gap-2">{circulo}{etiqueta}</span>}
              {i < PASOS.length - 1 && <span className={`flex-1 h-px ${hecho ? 'bg-positive/40' : 'bg-border'}`} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
