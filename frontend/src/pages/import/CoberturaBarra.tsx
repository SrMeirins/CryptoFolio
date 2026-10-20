import type { CoberturaExchange } from './types'
import { DISTINTIVO } from './exchangeColores'
import { finEscala, marcasAnio, nivelesMeses, segmento } from './coberturaVista'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { formatNumber } from '../../utils/format'

const f = formatFiscalDate
const RAYADO = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-warning) 55%, transparent) 0 4px, transparent 4px 8px)'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

// Línea de tiempo de un exchange (#328): tramos importados, huecos (rayado),
// pendiente hasta hoy (punteado), marcas de año e intensidad mensual debajo.
// Los tramos con archivos del lote en revisión se resaltan.
export function CoberturaBarra({ c }: { c: CoberturaExchange }) {
  const inicio = c.desde
  const fin = finEscala(c)
  const color = DISTINTIVO[c.exchange].color
  const meses = nivelesMeses(c.meses, inicio, fin)

  return (
    <div className="space-y-1">
      <div className="relative h-5 rounded-md bg-background-tertiary overflow-hidden" role="img"
        aria-label={`Cobertura de ${c.exchange === 'binance' ? 'Binance' : 'Bitvavo'}: ${c.tramos.length} tramo${c.tramos.length !== 1 ? 's' : ''} importado${c.tramos.length !== 1 ? 's' : ''}, ${c.huecos.length} hueco${c.huecos.length !== 1 ? 's' : ''}${c.pendiente ? `, ${c.pendiente.dias} días pendientes` : ''}`}>
        {c.tramos.map(t => {
          const s = segmento(t.desde, t.hasta, inicio, fin)
          return (
            <span key={t.desde} className="absolute inset-y-0" style={{ left: `${s.left}%`, width: `${s.width}%`, backgroundColor: color, opacity: 0.9 }}
              title={`${f(t.desde)} – ${f(t.hasta)} · ${formatNumber(t.transacciones, 0)} transacciones`} />
          )
        })}
        {/* Archivos del lote en revisión: su rango exacto, resaltado encima */}
        {c.tramos.flatMap(t => t.importaciones.filter(i => i.nuevo)).map(i => {
          const s = segmento(i.desde, i.hasta, inicio, fin)
          return (
            <span key={`n-${i.archivo}-${i.desde}`} className="absolute inset-y-0 rounded-sm bg-brand-solid/85 ring-2 ring-brand ring-offset-1 ring-offset-background-card"
              style={{ left: `${s.left}%`, width: `${Math.max(s.width, 1)}%` }}
              title={`${i.archivo}: ${f(i.desde)} – ${f(i.hasta)} (nuevo)`} />
          )
        })}
        {c.huecos.map(h => {
          const s = segmento(h.desde, h.hasta, inicio, fin)
          return (
            <span key={h.desde} className={`absolute inset-y-0 ${h.revisionId ? 'opacity-40' : ''}`}
              style={{ left: `${s.left}%`, width: `${s.width}%`, backgroundImage: RAYADO }}
              title={`Sin transacciones: ${f(h.desde)} – ${f(h.hasta)} (${h.dias} días)${h.revisionId ? ' · revisado' : ''}`} />
          )
        })}
        {c.pendiente && (() => {
          const s = segmento(c.pendiente.desde, c.pendiente.hasta, inicio, fin)
          return (
            <span className={`absolute inset-y-0.5 rounded-r-md border-2 border-dashed ${c.pendiente.revisionId ? 'border-border' : 'border-warning/70'}`}
              style={{ left: `${s.left}%`, width: `${s.width}%` }}
              title={`Pendiente de importar: ${f(c.pendiente.desde)} – hoy (${c.pendiente.dias} días)`} />
          )
        })()}
      </div>

      {/* Intensidad mensual */}
      <div className="flex h-2 gap-px" aria-hidden="true">
        {meses.map(m => (
          <span key={m.mes} className="flex-1 rounded-[1px] bg-brand" style={{ opacity: m.nivel === 0 ? 0.08 : 0.2 + m.nivel * 0.2 }}
            title={`${MESES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}: ${m.n} transacciones`} />
        ))}
      </div>

      <div className="relative h-3.5 text-[10px] text-fg-subtle" aria-hidden="true">
        <span className="absolute left-0">{f(inicio)}</span>
        {marcasAnio(inicio, fin).map(m => (
          <span key={m.anio} className="absolute -translate-x-1/2 mono hidden sm:inline" style={{ left: `${m.left}%` }}>{m.anio}</span>
        ))}
        <span className="absolute right-0">{c.pendiente ? 'hoy' : f(fin)}</span>
      </div>
    </div>
  )
}
