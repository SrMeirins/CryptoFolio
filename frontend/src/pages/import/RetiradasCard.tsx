import { useRef, useState } from 'react'
import { CheckCircle2, MapPin, X } from 'lucide-react'
import { buttonClasses } from '../../components/ui'
import { esArchivoRetiradas } from './direcciones'
import { validateFile } from './wizard'

// Historial de retiradas de Binance en la revisión (#320): añadirlo si falta o
// ver cuántos retiros ha completado con su dirección.
export function RetiradasCard({ resumen, nombre, cargando, onAnadir, onQuitar }: {
  resumen: { filas: number; emparejadas: number; retiros: number } | null | undefined
  nombre: string | null
  cargando: boolean
  onAnadir: (file: File) => void
  onQuitar: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function elegir(file: File | undefined) {
    if (!file) return
    const err = validateFile(file)
    if (err) { setError(err); return }
    if (!(await esArchivoRetiradas(file))) { setError('No es el historial de retiradas de Binance (Time, Coin, Network, Amount, Fee, Address, TXID, Status)'); return }
    setError(null)
    onAnadir(file)
  }

  if (resumen && nombre) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/5 px-4 py-2.5 text-xs text-fg-muted" role="status">
        <CheckCircle2 size={14} className="text-positive shrink-0" aria-hidden="true" />
        <span className="flex-1">
          Historial de retiradas: <span className="text-fg font-medium">{resumen.emparejadas} de {resumen.retiros}</span> retiros con dirección
          <span className="text-fg-subtle"> · {nombre}</span>
        </span>
        <button type="button" onClick={onQuitar} disabled={cargando} aria-label="Quitar el historial de retiradas"
          className="p-1 rounded-md text-fg-subtle hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"><X size={13} aria-hidden="true" /></button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-brand/25 bg-brand/5 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <MapPin size={16} className="text-brand shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-56">
          <p className="text-sm font-medium text-fg">¿Retiraste a tus wallets?</p>
          <p className="text-xs text-fg-muted">Añade el historial de retiradas de Binance y agruparemos los retiros por dirección; las que guardes se reconocerán solas.</p>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={cargando} className={buttonClasses('secondary', 'sm')}>
          {cargando ? 'Leyendo…' : 'Añadir historial de retiradas'}
        </button>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" tabIndex={-1}
          onChange={e => { void elegir(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <p className="text-[11px] text-fg-subtle">En Binance: Orders › Assets History › Export Withdrawal History › Customize dates › CSV.</p>
      {error && <p role="alert" className="text-xs text-negative">{error}</p>}
    </div>
  )
}
