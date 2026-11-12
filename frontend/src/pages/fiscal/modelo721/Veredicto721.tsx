import type { CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import { formatEur } from '../../../utils/format'
import { escalaBarra, textoMargen, textoVeredicto, type TonoVeredicto } from '../../../utils/modelo721View'
import type { Modelo721 } from '../types'

// Veredicto del 721 (#545): la respuesta en grande, su motivo y una barra con
// el valor que computa frente al umbral y, si ya se presentó, frente al valor
// a partir del cual vuelve a obligar. El texto dice el resultado; el color y
// el icono solo lo refuerzan.

const TONO: Record<TonoVeredicto, { caja: string; texto: string; barra: string; icono: typeof CheckCircle2 }> = {
  obligado: { caja: 'border-negative/30 bg-negative/5', texto: 'text-negative-ink', barra: 'bg-negative', icono: AlertTriangle },
  libre: { caja: 'border-positive/30 bg-positive/5', texto: 'text-positive-ink', barra: 'bg-positive', icono: CheckCircle2 },
  dudoso: { caja: 'border-warning/30 bg-warning/5', texto: 'text-warning-ink', barra: 'bg-warning', icono: HelpCircle },
}

/** Etiqueta bajo una marca: centrada, o pegada al borde si la marca está cerca de él. */
function posEtiqueta(p: number): { style: CSSProperties; className: string } {
  if (p > 80) return { style: { right: `${100 - p}%` }, className: 'text-right' }
  if (p < 20) return { style: { left: `${p}%` }, className: 'text-left' }
  return { style: { left: `${p}%`, transform: 'translateX(-50%)' }, className: 'text-center' }
}

export function Veredicto721({ data }: { data: Modelo721 }) {
  const v = data.veredicto
  const { titulo, motivo, tono } = textoVeredicto(v, !!data.presentado)
  const t = TONO[tono]
  const Icono = t.icono
  const { pct } = escalaBarra(v)
  const min = data.incompleto ? 'Al menos ' : ''
  return (
    <div className={`rounded-xl border px-4 py-4 space-y-3 ${t.caja}`}>
      <div className="flex items-start gap-3">
        <Icono size={22} className={`${t.texto} shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="min-w-0">
          <p className={`text-xl font-semibold ${t.texto}`} role="status">{titulo}</p>
          <p className="text-sm text-fg-muted mt-1">{motivo}</p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap text-xs">
          <span className="text-fg-subtle">En custodia en el extranjero</span>
          <span className="mono text-base font-semibold text-fg tabular-nums">{min}{formatEur(v.valorEur)}</span>
        </div>
        <p className="text-xs text-fg-muted mt-0.5">{textoMargen(v)}</p>
        {/* Barra con marcas: umbral y, si ya se presentó, el valor que vuelve a obligar. */}
        <div className="relative mt-2 h-2.5 rounded-full bg-overlay/10" role="img"
          aria-label={`${formatEur(v.valorEur)} frente al umbral de ${formatEur(v.umbral)}${v.objetivoIncremento !== null ? ` y al valor que vuelve a obligar, ${formatEur(v.objetivoIncremento)}` : ''}`}>
          <div className={`h-full rounded-full transition-[width] duration-500 ${t.barra}`} style={{ width: `${Math.max(pct(v.valorEur), v.valorEur > 0 ? 1 : 0)}%` }} />
          <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 bg-fg rounded" style={{ left: `${pct(v.umbral)}%` }} />
          {v.objetivoIncremento !== null && (
            <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dashed border-fg-muted" style={{ left: `${pct(v.objetivoIncremento)}%` }} />
          )}
        </div>
        <div className="relative h-8 mt-1 text-[11px] text-fg-subtle" aria-hidden="true">
          {(() => { const e = posEtiqueta(pct(v.umbral)); return (
            <span className={`absolute whitespace-nowrap ${e.className}`} style={e.style}>
              Umbral<br /><span className="mono">{formatEur(v.umbral)}</span>
            </span>
          ) })()}
          {v.objetivoIncremento !== null && (() => { const e = posEtiqueta(pct(v.objetivoIncremento)); return (
            <span className={`absolute whitespace-nowrap ${e.className}`} style={e.style}>
              Vuelve a obligar<br /><span className="mono">{formatEur(v.objetivoIncremento)}</span>
            </span>
          ) })()}
        </div>
      </div>
    </div>
  )
}
