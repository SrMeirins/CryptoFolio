import { Upload, FileText, RefreshCw, AlertCircle, Info } from 'lucide-react'

export function AccountChip({ account, colors }: { account: string; colors: Record<string, string> }) {
  const color = colors[account] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md font-medium"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {account}
    </span>
  )
}

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
  const help = EXCHANGE_HELP[exchange]
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border p-1 gap-1">
        {(['binance', 'bitvavo'] as const).map(ex => (
          <button
            key={ex}
            type="button"
            onClick={() => onExchangeChange(ex)}
            disabled={loading}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors capitalize
              ${exchange === ex ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="card bg-accent-blue/5 border-accent-blue/20 p-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-accent-blue shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-accent-blue">{help.title}</p>
            <ol className="text-gray-400 space-y-0.5 list-decimal list-inside">
              {help.steps.map(step => <li key={step}>{step}</li>)}
            </ol>
            <p className="text-gray-600 mt-1">{help.note}</p>
          </div>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
          ${dragOver ? 'border-accent-blue bg-accent-blue/5' : 'border-border hover:border-gray-500'}
          ${loading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); onDragOver(true) }}
        onDragLeave={() => onDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          onDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="text-accent-blue animate-spin" />
            <p className="text-gray-400 text-sm">Analizando CSV...</p>
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto text-gray-500 mb-3" />
            <p className="text-gray-300 font-medium capitalize">Arrastra tu CSV de {exchange} aquí</p>
            <p className="text-gray-600 text-sm mt-1">o haz click para seleccionar</p>
            <div className="flex items-center justify-center gap-3 mt-3 text-xs text-gray-700">
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
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg text-sm text-accent-red">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  )
}
