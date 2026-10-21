import { DISTINTIVO } from './exchangeColores'
import { marcasAnio, segmento } from './coberturaVista'
import { lineaCombinada, type TramoLinea, type Zona } from './lineaTiempo'
import type { CoberturaExchange } from './types'
import { formatFiscalDate } from '../../utils/fiscalTable'

const f = formatFiscalDate
const B = DISTINTIVO.binance.color
const V = DISTINTIVO.bitvavo.color
const AMBOS = `linear-gradient(to bottom, ${B} 0 50%, ${V} 50% 100%)`
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const NOMBRE_ZONA: Record<Zona, string> = { binance: 'Solo Binance', bitvavo: 'Solo Bitvavo', ambos: 'Binance y Bitvavo', ninguno: 'Sin datos' }
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

function fondo(z: Zona): React.CSSProperties {
  if (z === 'binance') return { backgroundColor: B }
  if (z === 'bitvavo') return { backgroundColor: V }
  if (z === 'ambos') return { backgroundImage: AMBOS }
  return {}
}

const textoTramo = (t: TramoLinea) =>
  `${t.pendiente ? 'Pendiente de importar' : NOMBRE_ZONA[t.zona]}: ${f(t.desde)} – ${f(t.hasta)} (${dias(t.dias)})`

function Muestra({ estilo, clase = '', children }: { estilo?: React.CSSProperties; clase?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-4 h-3 rounded-sm shrink-0 ${clase}`} style={estilo} aria-hidden="true" />{children}
    </span>
  )
}

// Línea de tiempo única de las importaciones (#328): de la primera transacción a
// hoy, qué exchanges tienen datos en cada periodo, los archivos nuevos del lote
// (si los hay) en su propio carril y la actividad mensual sumada.
export function LineaTiempo({ coberturas }: { coberturas: CoberturaExchange[] }) {
  const l = lineaCombinada(coberturas)
  if (!l) return null
  const zonas = new Set(l.tramos.map(t => (t.pendiente ? 'pendiente' : t.zona)))
  const etiquetaFin = l.tramos.at(-1)?.pendiente ? 'hoy' : f(l.fin)

  return (
    <div className="space-y-2">
      {/* Leyenda: solo lo que aparece */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-fg-muted">
        {zonas.has('binance') && <Muestra estilo={{ backgroundColor: B }}>Solo Binance</Muestra>}
        {zonas.has('bitvavo') && <Muestra estilo={{ backgroundColor: V }}>Solo Bitvavo</Muestra>}
        {zonas.has('ambos') && <Muestra estilo={{ backgroundImage: AMBOS }}>Ambos</Muestra>}
        {zonas.has('ninguno') && <Muestra clase="bg-background-tertiary border border-border">Sin datos</Muestra>}
        {zonas.has('pendiente') && <Muestra clase="border-2 border-dashed border-warning/70">Pendiente de importar</Muestra>}
        {l.nuevos.length > 0 && <Muestra clase="bg-brand-solid">Archivos nuevos</Muestra>}
      </div>

      <div className="relative h-7 rounded-lg bg-background-tertiary overflow-hidden ring-1 ring-inset ring-border" role="img"
        aria-label={`Cobertura de importaciones del ${f(l.inicio)} a ${etiquetaFin}`}>
        {l.tramos.map(t => {
          const s = segmento(t.desde, t.hasta, l.inicio, l.fin)
          return (
            <span key={t.desde} title={textoTramo(t)}
              className={`absolute inset-y-0 ${t.pendiente ? 'border-2 border-dashed border-warning/70 rounded-r-lg' : ''}`}
              style={{ left: `${s.left}%`, width: `${s.width}%`, ...fondo(t.zona) }} />
          )
        })}
      </div>

      {l.nuevos.length > 0 && (
        <div className="relative h-2" aria-hidden="true">
          {l.nuevos.map(n => {
            const s = segmento(n.desde, n.hasta, l.inicio, l.fin)
            return <span key={`${n.archivo}-${n.desde}`} className="absolute inset-y-0 rounded-full bg-brand-solid" style={{ left: `${s.left}%`, width: `${Math.max(s.width, 0.8)}%` }}
              title={`${n.archivo}: ${f(n.desde)} – ${f(n.hasta)}`} />
          })}
        </div>
      )}

      {/* Actividad mensual (ambos exchanges sumados) */}
      <div className="flex h-2.5 gap-px" aria-hidden="true">
        {l.meses.map(m => (
          <span key={m.mes} className="flex-1 rounded-[1px] bg-brand" style={{ opacity: m.nivel === 0 ? 0.08 : 0.2 + m.nivel * 0.2 }}
            title={`${MESES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}: ${m.total} transacciones${m.porExchange.binance && m.porExchange.bitvavo ? ` (Binance ${m.porExchange.binance}, Bitvavo ${m.porExchange.bitvavo})` : ''}`} />
        ))}
      </div>

      <div className="relative h-4 text-[10px] text-fg-subtle" aria-hidden="true">
        <span className="absolute left-0">{f(l.inicio)}</span>
        {marcasAnio(l.inicio, l.fin).map(m => (
          <span key={m.anio} className="absolute -translate-x-1/2 mono hidden sm:inline" style={{ left: `${m.left}%` }}>{m.anio}</span>
        ))}
        <span className="absolute right-0">{etiquetaFin}</span>
      </div>

      {/* Para lectores de pantalla: los periodos como lista */}
      <ul className="sr-only">
        {l.tramos.map(t => <li key={t.desde}>{textoTramo(t)}</li>)}
        {l.nuevos.map(n => <li key={`n-${n.archivo}-${n.desde}`}>Archivo nuevo {n.archivo}: {f(n.desde)} – {f(n.hasta)}</li>)}
      </ul>
    </div>
  )
}
