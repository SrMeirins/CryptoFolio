import type { BackupTable } from '../api/backup'
import { zonedFormat } from './zonedFormat'

// Utilidades del fichero de copia (#453): leerlo en el navegador antes de
// enviarlo, validar la contraseña al exportar y nombrar cada tabla.

export const BACKUP_FORMAT = 'cryptofolio-backup'
export const MIN_PASSWORD_LENGTH = 8
// El servidor admite hasta 100 MB por petición.
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024

/** Qué se enseña en la vista previa, en este orden. */
export const BACKUP_TABLE_LABELS: ReadonlyArray<{ table: BackupTable; label: string }> = [
  { table: 'transactions',         label: 'Operaciones' },
  { table: 'raw_transactions',     label: 'Filas originales de los CSV' },
  { table: 'csv_imports',          label: 'Importaciones' },
  { table: 'wallets',              label: 'Wallets' },
  { table: 'wallet_addresses',     label: 'Direcciones' },
  { table: 'asset_metadata',       label: 'Activos' },
  { table: 'app_config',           label: 'Ajustes' },
  { table: 'fiscal_declaraciones', label: 'Declaraciones marcadas' },
  { table: 'irpf_escalas',         label: 'Tramos IRPF propios' },
  { table: 'cobertura_revisiones', label: 'Revisiones de cobertura' },
  { table: 'networks',             label: 'Redes' },
  { table: 'network_assets',       label: 'Contratos de tokens' },
]

export type BackupFileResult =
  | { ok: true; backup: unknown; encrypted: boolean; exportedAt: string }
  | { ok: false; error: string }

/** Lee y reconoce un fichero de copia sin descifrarlo ni enviarlo. */
export function parseBackupText(text: string, size = text.length): BackupFileResult {
  if (size > MAX_BACKUP_BYTES) return { ok: false, error: 'El fichero supera los 100 MB.' }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El fichero no es un JSON válido.' }
  }
  const head = json as { format?: unknown; encrypted?: unknown; exported_at?: unknown; version?: unknown } | null
  if (head && head.version === '1.0') {
    return { ok: false, error: 'Es una copia del formato anterior, que no se puede restaurar. Exporta una nueva desde esta versión.' }
  }
  if (!head || head.format !== BACKUP_FORMAT || typeof head.encrypted !== 'boolean' || typeof head.exported_at !== 'string') {
    return { ok: false, error: 'El fichero no es una copia de CryptoFolio.' }
  }
  return { ok: true, backup: json, encrypted: head.encrypted, exportedAt: head.exported_at }
}

export async function readBackupFile(file: File): Promise<BackupFileResult> {
  if (file.size > MAX_BACKUP_BYTES) return { ok: false, error: 'El fichero supera los 100 MB.' }
  return parseBackupText(await file.text(), file.size)
}

/** Error de la contraseña al exportar, o null si vale. */
export function exportPasswordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (password !== confirm) return 'Las contraseñas no coinciden.'
  return null
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Fecha y hora de una copia en la zona de la app. */
export function formatBackupDate(iso: string): string {
  return zonedFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
