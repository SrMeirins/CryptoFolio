import { DISTINTIVO } from './exchangeColores'
import { marcasAnio, segmento } from './coberturaVista'
import { lineaCombinada } from './lineaTiempo'
import type { CoberturaExchange } from './types'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { formatNumber } from '../../utils/format'

const f = formatFiscalDate
const NOMBRE = { binance: 'Binance', bitvavo: 'Bitvavo' } as const
const RAYADO = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-warning) 55%, transparent) 0 3px, transparent 3px 7px)'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
const pos = (s: { left: number; width: number }) => ({ left: `${s.left}%`, width: `${s.width}%` })

function Muestra({ estilo, clase = '', children }: { estilo?: React.CSSProperties; clase?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-4 h-2.5 rounded-sm shrink-0 ${clase}`} style={estilo} aria-hidden="true" />{children}
    </span>
  )
}

// Línea de tiempo de las importaciones (#328, #332): un carril fino por exchange
// sobre la misma escala y el mismo eje. Cuando dos exchanges coinciden, ambos
// carriles están llenos en ese tramo. Debajo, archivos nuevos y actividad mensual.
export function LineaTiempo({ coberturas }: { coberturas: CoberturaExchange[] }) {
  const l = lineaCombinada(coberturas)
  if (!l) return null
  const hayHuecos = l.carriles.some(c => c.huecos.length > 0)
  const hayPendiente = l.carriles.some(c => c.pendiente)
  const etiquetaFin = hayPendiente ? 'hoy' : f(l.fin)
  const seg = (desde: string, hasta: string) => segmento(desde, hasta, l.inicio, l.fin)

  return (
    <div className="space-y-2">
      {(hayHuecos || hayPendiente || l.nuevos.length > 0) && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-fg-muted">
          {hayHuecos && <Muestra estilo={{ backgroundImage: RAYADO }} clase="ring-1 ring-inset ring-border">Hueco sin datos</Muestra>}
          {hayPendiente && <Muestra clase="border border-dashed border-warning/80">Pendiente de importar</Muestra>}
          {l.nuevos.length > 0 && <Muestra clase="bg-brand-solid">Archivos nuevos</Muestra>}
        </div>
      )}

      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1.5">
        {l.carriles.map(c => (
          <div key={c.exchange} className="contents">
            <span className="text-[11px] font-medium text-fg-muted truncate">{NOMBRE[c.exchange]}</span>
            <div className="relative h-3 rounded-full bg-background-tertiary overflow-hidden" role="img"
              aria-label={`${NOMBRE[c.exchange]}: ${c.tramos.map(t => `${f(t.desde)} – ${f(t.hasta)}`).join('; ')}${c.pendiente ? `; pendiente desde ${f(c.pendiente.desde)}` : ''}`}>
              {c.tramos.map(t => (
                <span key={t.desde} className="absolute inset-y-0 rounded-full" style={{ ...pos(seg(t.desde, t.hasta)), backgroundColor: DISTINTIVO[c.exchange].color }}
                  title={`${NOMBRE[c.exchange]}: ${f(t.desde)} – ${f(t.hasta)} · ${formatNumber(t.transacciones, 0)} transacciones`} />
              ))}
              {c.huecos.map(h => (
                <span key={h.desde} className={`absolute inset-y-0 ${h.revisionId ? 'opacity-40' : ''}`} style={{ ...pos(seg(h.desde, h.hasta)), backgroundImage: RAYADO }}
                  title={`${NOMBRE[c.exchange]} sin transacciones: ${f(h.desde)} – ${f(h.hasta)} (${dias(h.dias)})${h.revisionId ? ' · revisado' : ''}`} />
              ))}
              {c.pendiente && (
                <span className={`absolute inset-y-0 rounded-full border border-dashed ${c.pendiente.revisionId ? 'border-border' : 'border-warning/80'}`}
                  style={pos(seg(c.pendiente.desde, c.pendiente.hasta))}
                  title={`${NOMBRE[c.exchange]} pendiente de importar: ${f(c.pendiente.desde)} – hoy (${dias(c.pendiente.dias)})`} />
              )}
            </div>
          </div>
        ))}

        {l.nuevos.length > 0 && (
          <>
            <span className="text-[11px] text-fg-subtle">Nuevos</span>
            <div className="relative h-1.5" aria-hidden="true">
              {l.nuevos.map(n => {
                const s = seg(n.desde, n.hasta)
                return <span key={`${n.archivo}-${n.desde}`} className="absolute inset-y-0 rounded-full bg-brand-solid" style={{ left: `${s.left}%`, width: `${Math.max(s.width, 0.8)}%` }}
                  title={`${n.archivo} (${NOMBRE[n.exchange]}): ${f(n.desde)} – ${f(n.hasta)}`} />
              })}
            </div>
          </>
        )}

        <span className="text-[11px] text-fg-subtle">Actividad</span>
        <div className="flex h-2 gap-px" aria-hidden="true">
          {l.meses.map(m => (
            <span key={m.mes} className="flex-1 rounded-[1px] bg-brand" style={{ opacity: m.nivel === 0 ? 0.08 : 0.2 + m.nivel * 0.2 }}
              title={`${MESES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}: ${m.total} transacciones${m.porExchange.binance && m.porExchange.bitvavo ? ` (Binance ${m.porExchange.binance}, Bitvavo ${m.porExchange.bitvavo})` : ''}`} />
          ))}
        </div>

        <span />
        <div className="relative h-4 text-[10px] text-fg-subtle" aria-hidden="true">
          <span className="absolute left-0">{f(l.inicio)}</span>
          {marcasAnio(l.inicio, l.fin).map(m => (
            <span key={m.anio} className="absolute -translate-x-1/2 mono hidden sm:inline" style={{ left: `${m.left}%` }}>{m.anio}</span>
          ))}
          <span className="absolute right-0">{etiquetaFin}</span>
        </div>
      </div>
    </div>
  )
}
