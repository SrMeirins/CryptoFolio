import { AlertTriangle, CheckCircle2, Copy, MinusCircle, X } from 'lucide-react'
import { cardClasses } from '../../components/ui'
import { formatNumber } from '../../utils/format'
import { ExchangeBadge } from './ExchangeBadge'
import { EXCHANGE_LABEL } from './wizard'
import type { ArchivoLote } from './types'

const ESTADO = {
  listo: { icon: CheckCircle2, texto: 'Listo', clase: 'text-positive-ink bg-positive/10' },
  sin_novedades: { icon: MinusCircle, texto: 'Sin novedades', clase: 'text-fg-muted bg-overlay/5' },
  no_reconocido: { icon: AlertTriangle, texto: 'No reconocido', clase: 'text-warning bg-warning/10' },
} as const

// Archivos del lote en la revisión (#326): estado y cifras de cada uno, «Leer como…» y quitar.
export function LoteCard({ archivos, repetidas, cambiando, onLeerComo, onQuitar }: {
  archivos: ArchivoLote[]
  repetidas: number
  cambiando: boolean
  onLeerComo: (indice: number, ex: 'binance' | 'bitvavo') => void
  onQuitar: (indice: number) => void
}) {
  const n = (v: number) => formatNumber(v, 0)
  return (
    <section aria-labelledby="lote-titulo" className={cardClasses('md', 'space-y-3')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="lote-titulo" className="text-sm font-medium text-fg">Archivos del lote <span className="text-fg-subtle font-normal">· {archivos.length}</span></h2>
        {repetidas > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted" title="Filas que aparecen en más de un archivo: se importan una sola vez">
            <Copy size={12} aria-hidden="true" /> {n(repetidas)} fila{repetidas !== 1 ? 's' : ''} repetida{repetidas !== 1 ? 's' : ''} entre archivos, contada{repetidas !== 1 ? 's' : ''} una vez
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {archivos.map(a => {
          const e = ESTADO[a.estado]
          const Icon = e.icon
          const otro = a.exchange === 'binance' ? 'bitvavo' : 'binance'
          return (
            <li key={a.indice} className="flex items-center gap-3 flex-wrap rounded-xl border border-border px-3 py-2">
              <ExchangeBadge exchange={a.exchange} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg truncate">{a.nombre}</span>
                <span className="block text-[11px] text-fg-subtle">
                  {a.estado === 'no_reconocido' ? a.motivo : <>
                    {EXCHANGE_LABEL[a.exchange]}{a.rango ? ` · ${a.rango.from} – ${a.rango.to}` : ''} · {n(a.nuevas)} nueva{a.nuevas !== 1 ? 's' : ''}
                    {a.duplicadas > 0 && <> · {n(a.duplicadas)} ya importada{a.duplicadas !== 1 ? 's' : ''}</>}
                    {a.repetidasEnLote > 0 && <> · {n(a.repetidasEnLote)} en otro archivo</>}
                    {a.estado === 'sin_novedades' && a.motivo && <> · {a.motivo}</>}
                  </>}
                </span>
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${e.clase}`}>
                <Icon size={11} aria-hidden="true" /> {e.texto}
              </span>
              {a.estado === 'no_reconocido' && (
                <span className="flex items-center gap-1.5">
                  {(['binance', 'bitvavo'] as const).map(ex => (
                    <button key={ex} type="button" onClick={() => onLeerComo(a.indice, ex)} disabled={cambiando}
                      className="text-xs text-brand hover:underline disabled:opacity-50">Leer como {EXCHANGE_LABEL[ex]}</button>
                  ))}
                </span>
              )}
              {a.estado !== 'no_reconocido' && !a.reconocido && (
                <button type="button" onClick={() => onLeerComo(a.indice, otro)} disabled={cambiando}
                  className="text-xs text-brand hover:underline disabled:opacity-50">Leer como {EXCHANGE_LABEL[otro]}</button>
              )}
              <button type="button" onClick={() => onQuitar(a.indice)} disabled={cambiando} aria-label={`Quitar ${a.nombre} del lote`}
                className="p-1 rounded-md text-fg-subtle hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"><X size={14} aria-hidden="true" /></button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
