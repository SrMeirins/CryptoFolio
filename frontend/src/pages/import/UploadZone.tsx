import { useState } from 'react'
import { Upload, FileText, RefreshCw, AlertCircle, Info } from 'lucide-react'
import { cardClasses } from '../../components/ui'
import { SegmentedControl } from '../../components/ui'
import { formatNumber } from '../../utils/format'

const EXCHANGE_HELP: Record<'binance' | 'bitvavo', { title: string; steps: string[]; note: string }> = {
  binance: {
    title: 'Como exportar tu historial de Binance',
    steps: [
      'Ve a Binance > Orders > Transaction History',
      'Pulsa el icono de exportar en la esquina superior derecha',
      'Selecciona Export Transaction Records',
      'Elige el rango de fechas y formato CSV',
      'Espera a que se genere y descargalo',
    ],
    note: 'Soportamos exportaciones en ingles y espanol.',
  },
  bitvavo: {
    title: 'Como exportar tu historial de Bitvavo',
    steps: [
      'Ve a Bitvavo > Account > Order History / Transaction History',
      'Pulsa el icono de exportar / descargar CSV',
      'Selecciona el historial completo',
      'Espera a que se genere y descargalo',
    ],
    note: 'Soportamos el formato de exportacion estandar de Bitvavo (Timezone, Type, Currency...).',
  },
}

// Mismos límites que exige el backend (multer, routes/imports.ts) — validar
// aquí antes de subir da feedback instantáneo en vez de esperar un fallo de
// red tras enviar el fichero completo.
const MAX_FILE_SIZE = 10 * 1024 * 1024

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Solo se aceptan archivos CSV'
  if (file.size > MAX_FILE_SIZE) return `El archivo supera el máximo de 10 MB (${formatNumber(file.size / 1024 / 1024, 1, 1)} MB)`
  return null
}

export function UploadZone({ dragOver, loading, error, fileRef, exchange, onExchangeChange, onDragOver, onFile }: {
  dragOver: boolean
  loading: boolean
  error: string | null
  fileRef: React.RefObject<HTMLInputElement>
  exchange: 'binance' | 'bitvavo'
  onExchangeChange: (e: 'binance' | 'bitvavo') => void
  onDragOver: (v: boolean) => void
  onFile: (f: File) => void
}) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const help = EXCHANGE_HELP[exchange]

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
      <SegmentedControl label="Exchange del CSV" size="md" value={exchange} onChange={onExchangeChange} disabled={loading}
        options={[{ value: 'binance', label: 'Binance' }, { value: 'bitvavo', label: 'Bitvavo' }]} />

      <div className={cardClasses('sm', 'bg-info/5 border-info/20')}>
        <div className="flex items-start gap-3">
          <Info size={16} className="text-info shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-info">{help.title}</p>
            <ol className="text-fg-muted space-y-0.5 list-decimal list-inside">
              {help.steps.map(step => <li key={step}>{step}</li>)}
            </ol>
            <p className="text-fg-subtle mt-1">{help.note}</p>
          </div>
        </div>
      </div>

      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-label="Seleccionar o arrastrar archivo CSV"
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
          ${dragOver ? 'border-brand bg-brand/5' : 'border-border hover:border-fg-subtle'}
          ${loading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onClick={openPicker}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() }
        }}
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
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="text-brand animate-spin" />
            <p className="text-fg-muted text-sm">Analizando CSV...</p>
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto text-fg-subtle mb-3" />
            <p className="text-fg font-medium capitalize">Arrastra tu CSV de {exchange} aquí</p>
            <p className="text-fg-subtle text-sm mt-1">o haz click para seleccionar</p>
            <div className="flex items-center justify-center gap-3 mt-3 text-xs text-fg-subtle">
              <span>Transaction History export</span>
              <span>·</span>
              <span className="flex items-center gap-1"><FileText size={11} /> Solo .csv</span>
              <span>·</span>
              <span>Máximo 10 MB</span>
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {(validationError || error) && (
        <div className="flex items-start gap-2 p-4 bg-negative/10 border border-negative/20 rounded-lg text-sm text-negative">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {validationError ?? error}
        </div>
      )}
    </div>
  )
}
