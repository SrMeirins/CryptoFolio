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

export function UploadZone({ dragOver, loading, error, fileRef, onDragOver, onFile }: {
  dragOver: boolean
  loading: boolean
  error: string | null
  fileRef: React.RefObject<HTMLInputElement>
  onDragOver: (v: boolean) => void
  onFile: (f: File) => void
}) {
  return (
    <div className="space-y-4">
      <div className="card bg-accent-blue/5 border-accent-blue/20 p-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-accent-blue shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-accent-blue">Como exportar tu historial de Binance</p>
            <ol className="text-gray-400 space-y-0.5 list-decimal list-inside">
              <li>Ve a <span className="text-white">Binance &gt; Orders &gt; Transaction History</span></li>
              <li>Pulsa el icono de exportar en la esquina superior derecha</li>
              <li>Selecciona <span className="text-white">Export Transaction Records</span></li>
              <li>Elige el rango de fechas y formato <span className="text-white">CSV</span></li>
              <li>Espera a que se genere y descargalo</li>
            </ol>
            <p className="text-gray-600 mt-1">Soportamos exportaciones en ingles y espanol.</p>
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
            <p className="text-gray-300 font-medium">Arrastra tu CSV de Binance aquí</p>
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
