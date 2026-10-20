import { useState } from 'react'
import { Upload, FileText, RefreshCw, AlertCircle, ChevronDown, CalendarClock } from 'lucide-react'
import { cardClasses, SegmentedControl } from '../../components/ui'
import { formatNumber } from '../../utils/format'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { EXCHANGE_LABEL, type UltimaImportacion } from './wizard'

type ExchangeId = 'binance' | 'bitvavo'

const EXCHANGE_HELP: Record<ExchangeId, { steps: string[]; note: string }> = {
  binance: {
    steps: [
      'Ve a Binance > Orders > Transaction History',
      'Pulsa el icono de exportar en la esquina superior derecha',
      'Selecciona Export Transaction Records',
      'Elige el rango de fechas y formato CSV',
      'Espera a que se genere y descárgalo',
    ],
    note: 'Admite exportaciones en inglés y español.',
  },
  bitvavo: {
    steps: [
      'Ve a Bitvavo > Account > Order History / Transaction History',
      'Pulsa el icono de exportar / descargar CSV',
      'Selecciona el historial completo',
      'Espera a que se genere y descárgalo',
    ],
    note: 'Formato de exportación estándar de Bitvavo (Timezone, Type, Currency…).',
  },
}

// Distintivo propio de cada exchange (#318): color e inicial, sin logotipos de marca.
const DISTINTIVO: Record<ExchangeId, { color: string; texto: string; inicial: string }> = {
  binance: { color: '#F0B90B', texto: '#1E2026', inicial: 'B' },   // texto oscuro: el blanco sobre amarillo no contrasta
  bitvavo: { color: '#0051FF', texto: '#FFFFFF', inicial: 'b' },
}

export function ExchangeBadge({ exchange, size = 20 }: { exchange: string; size?: number }) {
  const d = DISTINTIVO[exchange as ExchangeId]
  if (!d) return null
  return (
    <span className="inline-grid place-items-center rounded-md font-bold shrink-0" aria-hidden="true"
      style={{ width: size, height: size, backgroundColor: d.color, color: d.texto, fontSize: size * 0.55 }}>{d.inicial}</span>
  )
}

// Mismos límites que el backend: feedback instantáneo antes de subir.
const MAX_FILE_SIZE = 10 * 1024 * 1024

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Solo se aceptan archivos .csv'
  if (file.size > MAX_FILE_SIZE) return `El archivo supera el máximo de 10 MB (${formatNumber(file.size / 1024 / 1024, 1, 1)} MB)`
  return null
}

const haceTexto = (dias: number) => (dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : dias < 60 ? `hace ${dias} días` : `hace ${Math.round(dias / 30)} meses`)

// Paso Subir (#318): zona de arrastre con detección automática del exchange,
// guía de exportación plegable y hasta dónde llega lo ya importado.
export function UploadZone({ dragOver, loading, error, fileRef, onDragOver, onFile, ultimas }: {
  dragOver: boolean
  loading: boolean
  error: string | null
  fileRef: React.RefObject<HTMLInputElement>
  onDragOver: (v: boolean) => void
  onFile: (f: File) => void
  ultimas: UltimaImportacion[]
}) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [guiaAbierta, setGuiaAbierta] = useState(false)
  const [guia, setGuia] = useState<ExchangeId>('binance')
  const help = EXCHANGE_HELP[guia]

  function handleFile(file: File) {
    const err = validateFile(file)
    setValidationError(err)
    if (!err) onFile(file)
  }
  function openPicker() {
    if (!loading) fileRef.current?.click()
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-label="Seleccionar o arrastrar un CSV de Binance o Bitvavo"
        aria-busy={loading}
        className={`relative overflow-hidden border-2 border-dashed rounded-2xl px-6 py-14 text-center transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60
          ${dragOver ? 'border-brand bg-brand/8 scale-[1.01] motion-reduce:scale-100' : 'border-border hover:border-fg-subtle hover:bg-overlay/2'}
          ${loading ? 'opacity-60 pointer-events-none' : ''}`}
        onClick={openPicker}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } }}
        onDragOver={e => { e.preventDefault(); onDragOver(true) }}
        onDragLeave={() => onDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          onDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3" role="status">
            <RefreshCw size={32} className="text-brand animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-fg-muted text-sm">Analizando el CSV…</p>
          </div>
        ) : (
          <>
            <span className={`mx-auto mb-4 grid place-items-center size-14 rounded-2xl transition-colors ${dragOver ? 'bg-brand text-white' : 'bg-brand/10 text-brand'}`} aria-hidden="true">
              <Upload size={26} />
            </span>
            <p className="text-fg font-semibold text-base">{dragOver ? 'Suelta el archivo para analizarlo' : 'Arrastra tu CSV aquí'}</p>
            <p className="text-fg-subtle text-sm mt-1">o haz clic para seleccionarlo · reconocemos el exchange automáticamente</p>
            <div className="flex items-center justify-center gap-4 mt-5 text-xs text-fg-muted flex-wrap">
              <span className="inline-flex items-center gap-1.5"><ExchangeBadge exchange="binance" /> Binance</span>
              <span className="inline-flex items-center gap-1.5"><ExchangeBadge exchange="bitvavo" /> Bitvavo</span>
              <span className="text-fg-subtle inline-flex items-center gap-1"><FileText size={11} aria-hidden="true" /> .csv · máximo 10 MB</span>
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv" className="hidden" tabIndex={-1}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>

      {(validationError || error) && (
        <p role="alert" className="flex items-start gap-2 p-4 bg-negative/10 border border-negative/20 rounded-xl text-sm text-negative">
          <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
          {validationError ?? error}
        </p>
      )}

      {/* Hasta dónde llega lo importado: desde ahí conviene exportar */}
      {ultimas.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Última importación por exchange">
          {ultimas.map(u => (
            <li key={u.exchange} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${u.haceDias > 60 ? 'border-warning/30 bg-warning/5' : 'border-border'}`}>
              <ExchangeBadge exchange={u.exchange} size={16} />
              <span className="text-fg-muted">{EXCHANGE_LABEL[u.exchange] ?? u.exchange}: hasta el <span className="text-fg">{formatFiscalDate(u.hasta.slice(0, 10))}</span></span>
              <span className={`inline-flex items-center gap-1 ${u.haceDias > 60 ? 'text-warning' : 'text-fg-subtle'}`}><CalendarClock size={11} aria-hidden="true" />{haceTexto(u.haceDias)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Guía de exportación plegable */}
      <div className={cardClasses('none', 'overflow-hidden')}>
        <button type="button" onClick={() => setGuiaAbierta(o => !o)} aria-expanded={guiaAbierta} aria-controls="guia-exportar"
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-fg-muted hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60">
          ¿Cómo exporto mi historial?
          <ChevronDown size={15} className={`transition-transform ${guiaAbierta ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {guiaAbierta && (
          <div id="guia-exportar" className="px-4 pb-4 space-y-3 border-t border-border pt-3">
            <SegmentedControl label="Exchange de la guía" value={guia} onChange={setGuia}
              options={[{ value: 'binance', label: 'Binance' }, { value: 'bitvavo', label: 'Bitvavo' }]} />
            <ol className="text-xs text-fg-muted space-y-1 list-decimal list-inside">
              {help.steps.map(step => <li key={step}>{step}</li>)}
            </ol>
            <p className="text-xs text-fg-subtle">{help.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
