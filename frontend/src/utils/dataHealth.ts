import { formatBytes } from './backupFile'

// Salud de los datos en Datos (#454): tamaño en disco y cuándo fue lo último
// importado, recalculado y copiado. Marca lo que conviene revisar con texto,
// no solo con color.

export interface HealthStats {
  dbSizeBytes: number
  lastImportAt: string | null
  lastFifoAt: string | null
  lastBackupAt: string | null
}

export interface HealthCard { key: 'size' | 'import' | 'fifo' | 'backup'; label: string; value: string; warning: string | null; help: string }

const HOUR = 3_600_000
const DAY = 24 * HOUR
// Sin copia en más de una semana y un día, algo va mal aunque la frecuencia sea semanal.
const BACKUP_STALE_MS = 8 * DAY

export function sinceLabel(iso: string | null, now: Date): string {
  if (!iso) return 'Nunca'
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime())
  if (ms < HOUR) return `Hace ${Math.max(1, Math.floor(ms / 60_000))} min`
  if (ms < 2 * DAY) return `Hace ${Math.floor(ms / HOUR)} h`
  return `Hace ${Math.floor(ms / DAY)} días`
}

export function healthCards(s: HealthStats, now: Date): HealthCard[] {
  const fifoStale = s.lastImportAt !== null && (s.lastFifoAt === null || s.lastFifoAt < s.lastImportAt)
  const backupStale = s.lastBackupAt === null || now.getTime() - new Date(s.lastBackupAt).getTime() > BACKUP_STALE_MS
  return [
    { key: 'size', label: 'Tamaño en disco', value: formatBytes(s.dbSizeBytes), warning: null,
      help: 'Lo que ocupa la base de datos, incluidas las cachés de precios.' },
    { key: 'import', label: 'Última importación', value: sinceLabel(s.lastImportAt, now), warning: null,
      help: 'Cuándo se importó el último CSV.' },
    { key: 'fifo', label: 'Último FIFO', value: sinceLabel(s.lastFifoAt, now), warning: fifoStale ? 'Anterior a la última importación' : null,
      help: 'Cuándo se recalcularon por última vez los lotes y plusvalías.' },
    { key: 'backup', label: 'Última copia', value: sinceLabel(s.lastBackupAt, now), warning: backupStale ? 'Sin copias recientes' : null,
      help: 'La copia automática más reciente de este equipo.' },
  ]
}
