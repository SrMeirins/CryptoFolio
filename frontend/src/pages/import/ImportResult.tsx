import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, ChevronDown, History, Landmark, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProgressEvent, ResumenImportacion } from './types'
import { ImportLogPanel } from './ImportLogPanel'
import { buttonClasses, cardClasses } from '../../components/ui'
import { formatEur, pnlColor } from '../../utils/format'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { formatoDuracion } from './progreso'
import { ExchangeBadge } from './ExchangeBadge'

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`
const fmt = new Intl.NumberFormat('es-ES')

// Resultado de la importación (#324): cifras, impacto fiscal por ejercicio,
// avisos en lenguaje claro con dónde resolverlos y acciones siguientes.
export function ImportResult({ resumen, duracion, log, onGoToDashboard, onReset, onVerHistorial, onIrFiscal }: {
  resumen: ResumenImportacion | undefined
  duracion: number
  log: ProgressEvent[]
  onGoToDashboard: () => void
  onReset: () => void
  onVerHistorial: (importId: string) => void
  onIrFiscal: (year?: number) => void
}) {
  const [verLog, setVerLog] = useState(false)
  const avisos = resumen?.avisos ?? []
  const sinPrecio = resumen?.precios.sinPrecio ?? []
  const faltanPrecios = resumen ? resumen.precios.necesarios - resumen.precios.obtenidos : 0
  // Lote (#326): una importación por archivo, cada una con su enlace al Historial.
  const porArchivo = resumen?.archivos && resumen.archivos.length > 1 ? resumen.archivos : null

  return (
    <div className="space-y-4">
      <div className={cardClasses('md', 'space-y-5')}>
        <div className="flex items-start gap-3">
          <CheckCircle2 size={28} className="text-positive shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-fg" role="status">Importación completada</h2>
            <p className="text-xs text-fg-subtle">
              {porArchivo ? <>{porArchivo.length} archivos · </> : resumen ? <>{resumen.archivo} · </> : null}en {formatoDuracion(duracion)}
            </p>
          </div>
        </div>

        {resumen ? (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-background-tertiary rounded-xl p-3">
              <dt className="text-xs text-fg-subtle">Transacciones nuevas</dt>
              <dd className="text-2xl font-bold mono text-positive">{fmt.format(resumen.nuevas)}</dd>
            </div>
            <div className="bg-background-tertiary rounded-xl p-3">
              <dt className="text-xs text-fg-subtle">Ya estaban (ignoradas)</dt>
              <dd className="text-2xl font-bold mono text-fg-muted">{fmt.format(resumen.duplicadas)}</dd>
            </div>
            <div className="bg-background-tertiary rounded-xl p-3">
              <dt className="text-xs text-fg-subtle">Precios históricos</dt>
              <dd className="text-2xl font-bold mono text-fg">
                {resumen.precios.necesarios === 0 ? 'En caché' : `${fmt.format(resumen.precios.obtenidos)} de ${fmt.format(resumen.precios.necesarios)}`}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">La importación terminó, pero no llegó el resumen (se perdió la conexión). Revisa el Historial para ver lo importado.</p>
        )}

        {porArchivo && (
          <section aria-labelledby="archivos-titulo" className="space-y-2">
            <h3 id="archivos-titulo" className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Por archivo</h3>
            <ul className="space-y-1.5">
              {porArchivo.map(a => (
                <li key={a.importId} className="flex items-center gap-3 flex-wrap rounded-xl border border-border px-3 py-2 text-sm">
                  <ExchangeBadge exchange={a.exchange} size={18} />
                  <span className="min-w-0 flex-1 truncate text-fg">{a.archivo}</span>
                  <span className="text-xs text-fg-subtle mono">{fmt.format(a.nuevas)} nueva{a.nuevas !== 1 ? 's' : ''} · {fmt.format(a.duplicadas)} ya estaba{a.duplicadas !== 1 ? 'n' : ''}</span>
                  {a.nuevas > 0 && (
                    <button type="button" onClick={() => onVerHistorial(a.importId)} className="text-xs text-brand hover:underline">Ver en Historial</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Impacto fiscal por ejercicio */}
        {resumen && (
          <section aria-labelledby="impacto-titulo" className="space-y-2">
            <h3 id="impacto-titulo" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              <Landmark size={12} aria-hidden="true" /> Impacto en tu fiscalidad
            </h3>
            {resumen.impacto.length === 0 ? (
              <p className="text-xs text-fg-muted">No cambia la ganancia o pérdida de ningún ejercicio.</p>
            ) : (
              <ul className="space-y-1.5">
                {resumen.impacto.map(i => (
                  <li key={i.year} className="flex items-center gap-3 flex-wrap rounded-xl border border-border px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-fg"><CalendarRange size={13} className="text-fg-subtle" aria-hidden="true" />{i.year}</span>
                    <span className="mono text-xs text-fg-subtle">{signed(i.antes)} → <span className={pnlColor(i.despues)}>{signed(i.despues)}</span></span>
                    <span className={`mono text-xs font-semibold ${pnlColor(i.despues - i.antes)}`}>({signed(i.despues - i.antes)})</span>
                    <span className="flex-1" />
                    <button type="button" onClick={() => onIrFiscal(i.year)} className="text-xs text-brand hover:underline">Ver {i.year} en Fiscal</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {resumen && resumen.nuevas > 0 && !porArchivo && (
            <button type="button" onClick={() => onVerHistorial(resumen.importId)} className={buttonClasses('primary', 'md', 'flex gap-1.5')}>
              <History size={14} aria-hidden="true" /> Ver estas transacciones en Historial
            </button>
          )}
          <button type="button" onClick={() => onIrFiscal(resumen?.impacto[0]?.year)} className={buttonClasses('secondary', 'md', 'flex gap-1.5')}>
            <Landmark size={14} aria-hidden="true" /> Ir a Fiscal
          </button>
          <button type="button" onClick={onReset} className={buttonClasses('secondary', 'md', 'flex gap-1.5')}>
            <Upload size={14} aria-hidden="true" /> Importar otro archivo
          </button>
          <button type="button" onClick={onGoToDashboard} className={buttonClasses('ghost', 'md', 'flex gap-1.5')}>
            Ver Dashboard <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Avisos */}
      {(avisos.length > 0 || faltanPrecios > 0) && (
        <section aria-labelledby="avisos-titulo" className={cardClasses('md', 'space-y-3 border-warning/30')}>
          <h3 id="avisos-titulo" className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle size={15} aria-hidden="true" /> Conviene revisar
          </h3>
          <ul className="space-y-2">
            {avisos.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-xs">
                <span className="text-fg-muted flex-1">{a.mensaje}{a.veces > 1 && <span className="text-fg-subtle"> ({a.veces} veces)</span>}</span>
                {a.activo && <Link to={`/history?buscar=${encodeURIComponent(a.activo)}`} className="text-brand hover:underline shrink-0">Ver {a.activo} en Historial</Link>}
              </li>
            ))}
            {faltanPrecios > 0 && (
              <li className="flex items-start gap-3 text-xs">
                <span className="text-fg-muted flex-1">
                  {faltanPrecios === 1 ? 'No se encontró 1 precio histórico' : `No se encontraron ${fmt.format(faltanPrecios)} precios históricos`}
                  {sinPrecio.length > 0 && <>: {sinPrecio.slice(0, 6).map(p => `${p.activo} (${formatFiscalDate(p.fecha)})`).join(', ')}{faltanPrecios > 6 ? '…' : ''}</>}.
                  {' '}Esas operaciones se valoran sin precio hasta que lo haya.
                </span>
                <Link to="/settings?tab=assets" className="text-brand hover:underline shrink-0">Fuente de precios en Ajustes</Link>
              </li>
            )}
          </ul>
        </section>
      )}

      <div>
        <button type="button" onClick={() => setVerLog(v => !v)} aria-expanded={verLog}
          className="text-xs text-fg-subtle hover:text-fg flex items-center gap-1.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">
          <ChevronDown size={12} className={`transition-transform ${verLog ? 'rotate-180' : ''}`} aria-hidden="true" />
          {verLog ? 'Ocultar detalles técnicos' : 'Ver detalles técnicos'}
        </button>
        {verLog && <div className="mt-2"><ImportLogPanel log={log} done /></div>}
      </div>
    </div>
  )
}
