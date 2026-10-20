import { FileText, MapPin, Play, Plus, X } from 'lucide-react'
import { buttonClasses, cardClasses } from '../../components/ui'
import { formatNumber } from '../../utils/format'
import { ExchangeBadge } from './ExchangeBadge'
import { EXCHANGE_LABEL } from './wizard'
import { MAX_POR_TIPO, type ArchivoSel } from './lote'

const tamano = (b: number) => (b < 1024 * 1024 ? `${formatNumber(b / 1024, 0)} KB` : `${formatNumber(b / 1024 / 1024, 1, 1)} MB`)

// Archivos elegidos antes de analizar (#326): tipo y exchange detectados, quitar, añadir más y analizar.
export function ArchivosSeleccion({ seleccion, loading, onQuitar, onAnadir, onAnalizar }: {
  seleccion: ArchivoSel[]
  loading: boolean
  onQuitar: (id: string) => void
  onAnadir: () => void
  onAnalizar: () => void
}) {
  const tx = seleccion.filter(s => s.tipo === 'transacciones').length
  return (
    <section aria-labelledby="seleccion-titulo" className={cardClasses('md', 'space-y-3')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="seleccion-titulo" className="text-sm font-medium text-fg">
          Archivos elegidos <span className="text-fg-subtle font-normal">· {tx} de transacciones{seleccion.length > tx ? `, ${seleccion.length - tx} de retiradas` : ''}</span>
        </h2>
        <span className="text-[11px] text-fg-subtle">Hasta {MAX_POR_TIPO} de cada tipo · 10 MB por archivo</span>
      </div>
      <ul className="space-y-1.5">
        {seleccion.map(s => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
            {s.tipo === 'retiradas'
              ? <MapPin size={15} className="text-brand shrink-0" aria-hidden="true" />
              : s.exchange ? <ExchangeBadge exchange={s.exchange} size={18} /> : <FileText size={15} className="text-fg-subtle shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-fg truncate">{s.file.name}</span>
              <span className="block text-[11px] text-fg-subtle">
                {s.tipo === 'retiradas' ? 'Historial de retiradas de Binance'
                  : s.exchange ? `Transacciones de ${EXCHANGE_LABEL[s.exchange]}` : 'Formato sin reconocer: se comprobará al analizar'}
                {' · '}{tamano(s.file.size)}
              </span>
            </span>
            <button type="button" onClick={() => onQuitar(s.id)} aria-label={`Quitar ${s.file.name}`} disabled={loading}
              className="p-1 rounded-md text-fg-subtle hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"><X size={14} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button type="button" onClick={onAnadir} disabled={loading} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
          <Plus size={13} aria-hidden="true" /> Añadir más
        </button>
        <button type="button" onClick={onAnalizar} disabled={loading || tx === 0} className={buttonClasses('primary', 'sm', 'flex gap-1.5')}>
          <Play size={13} aria-hidden="true" /> {loading ? 'Analizando…' : tx === 0 ? 'Falta un historial de transacciones' : `Analizar ${tx === 1 ? 'el archivo' : `${tx} archivos`}`}
        </button>
      </div>
    </section>
  )
}
