import { useState } from 'react'
import { Upload, FileText, RefreshCw, AlertCircle, ChevronDown, MapPin } from 'lucide-react'
import { cardClasses, SegmentedControl } from '../../components/ui'
import { validateFile } from './wizard'
import { CoberturaPanel } from './CoberturaPanel'
import { ArchivosSeleccion } from './ArchivosSeleccion'
import { ExchangeBadge } from './ExchangeBadge'
import type { ArchivoSel } from './lote'

type ExchangeId = 'binance' | 'bitvavo'

const EXCHANGE_HELP: Record<ExchangeId, { steps: string[]; note: string; retiradas?: string[] }> = {
  binance: {
    steps: [
      'Ve a Binance > Orders > Transaction History',
      'Pulsa el icono de exportar en la esquina superior derecha',
      'Selecciona Export Transaction Records',
      'Elige el rango de fechas y formato CSV',
      'Espera a que se genere y descárgalo',
    ],
    note: 'Admite exportaciones en inglés y español.',
    // Opcional (#320): aporta la dirección de cada retiro para reconocer tus wallets.
    retiradas: [
      'Ve a Binance > Orders > Assets History',
      'Pulsa Export Withdrawal History',
      'Elige Customize dates con el mismo rango',
      'Formato CSV y descárgalo',
    ],
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



// Paso Subir (#318): zona de arrastre con detección automática del exchange,
// guía de exportación plegable y hasta dónde llega lo ya importado.
export function UploadZone({ dragOver, loading, error, fileRef, onDragOver, onFiles, seleccion, onQuitar, onAnalizar }: {
  dragOver: boolean
  loading: boolean
  error: string | null
  fileRef: React.RefObject<HTMLInputElement>
  onDragOver: (v: boolean) => void
  /** Archivos soltados o elegidos: historiales de transacciones y de retiradas (#320, #326). */
  onFiles: (files: File[]) => void
  /** Archivos ya elegidos, a la espera de analizarlos (#326). */
  seleccion: ArchivoSel[]
  onQuitar: (id: string) => void
  onAnalizar: () => void
}) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [guiaAbierta, setGuiaAbierta] = useState(false)
  const [guia, setGuia] = useState<ExchangeId>('binance')
  const help = EXCHANGE_HELP[guia]

  function handleFiles(list: FileList | null | undefined) {
    const files = [...(list ?? [])]
    if (files.length === 0) return
    const err = files.map(validateFile).find(Boolean) ?? null
    setValidationError(err)
    if (!err) onFiles(files)
  }
  // «Ver guía» desde la cobertura: abre la guía en la pestaña de ese exchange.
  function verGuia(ex: ExchangeId) {
    setGuia(ex)
    setGuiaAbierta(true)
    requestAnimationFrame(() => document.getElementById('guia-exportar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
  function openPicker() {
    if (!loading) fileRef.current?.click()
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-label="Elegir o arrastrar uno o varios CSV de Binance o Bitvavo"
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
          handleFiles(e.dataTransfer.files)
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3" role="status">
            <RefreshCw size={32} className="text-brand animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-fg-muted text-sm">Analizando…</p>
          </div>
        ) : (
          <>
            <span className={`mx-auto mb-4 grid place-items-center size-14 rounded-2xl transition-colors ${dragOver ? 'bg-brand text-white' : 'bg-brand/10 text-brand'}`} aria-hidden="true">
              <Upload size={26} />
            </span>
            <p className="text-fg font-semibold text-base">{dragOver ? 'Suelta los archivos' : seleccion.length > 0 ? 'Arrastra más archivos aquí' : 'Arrastra tus CSV aquí'}</p>
            <p className="text-fg-subtle text-sm mt-1">o haz clic para elegirlos · uno o varios, de Binance y Bitvavo · reconocemos el exchange de cada uno</p>
            <p className="text-fg-subtle text-xs mt-1">Binance: puedes añadir también el historial de retiradas para reconocer tus wallets</p>
            <div className="flex items-center justify-center gap-4 mt-5 text-xs text-fg-muted flex-wrap">
              <span className="inline-flex items-center gap-1.5"><ExchangeBadge exchange="binance" /> Binance</span>
              <span className="inline-flex items-center gap-1.5"><ExchangeBadge exchange="bitvavo" /> Bitvavo</span>
              <span className="text-fg-subtle inline-flex items-center gap-1"><FileText size={11} aria-hidden="true" /> .csv · máximo 10 MB</span>
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" tabIndex={-1}
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {seleccion.length > 0 && (
        <ArchivosSeleccion seleccion={seleccion} loading={loading} onQuitar={onQuitar} onAnadir={openPicker} onAnalizar={onAnalizar} />
      )}

      {(validationError || error) && (
        <p role="alert" className="flex items-start gap-2 p-4 bg-negative/10 border border-negative/20 rounded-xl text-sm text-negative">
          <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
          {validationError ?? error}
        </p>
      )}

      {/* Cobertura por exchange: tramos, huecos y lo pendiente hasta hoy (#328) */}
      <CoberturaPanel onVerGuia={verGuia} />

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
            {help.retiradas && (
              <div className="rounded-lg border border-border px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-medium text-fg flex items-center gap-1.5"><MapPin size={12} className="text-brand" aria-hidden="true" /> Opcional: historial de retiradas</p>
                <p className="text-[11px] text-fg-subtle">Trae la dirección de cada retiro para reconocer tus wallets. Suéltalo junto al de transacciones.</p>
                <ol className="text-xs text-fg-muted space-y-1 list-decimal list-inside">
                  {help.retiradas.map(step => <li key={step}>{step}</li>)}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
