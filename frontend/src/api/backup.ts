import { api } from './client'

// Copias de seguridad (#453): exportar, revisar, restaurar y volver atrás.

export type BackupTable =
  | 'networks' | 'network_assets' | 'wallets' | 'wallet_addresses' | 'csv_imports' | 'transactions'
  | 'raw_transactions' | 'asset_metadata' | 'app_config' | 'cobertura_revisiones' | 'fiscal_declaraciones' | 'irpf_escalas'

export type BackupCounts = Partial<Record<BackupTable, number>>

export interface BackupPreview {
  schema: number
  exported_at: string
  encrypted: boolean
  counts: BackupCounts
  current: BackupCounts
}

export interface BackupSnapshot {
  id: string
  created_at: string
  schema: number
  counts: BackupCounts
}

/** Copias automáticas (#454): por qué no están disponibles, si no lo están. */
export type AutoBackupUnavailable = 'sin-carpeta' | 'sin-clave'

export interface AutoBackupFile { name: string; size: number; created_at: string }

export interface AutoBackupStatus {
  available: boolean
  reason: AutoBackupUnavailable | null
  settings: { enabled: boolean; frequencyHours: number; keep: number }
  files: AutoBackupFile[]
  lastFailure: { at: string; message: string } | null
}

export const backupApi = {
  /** Con contraseña, la copia sale cifrada; va en el cuerpo, nunca en la URL. */
  export: (password?: string) => api.post<Record<string, unknown>>('/settings/backup', password ? { password } : {}),
  preview: (backup: unknown, password?: string) => api.post<BackupPreview>('/settings/backup/preview', { backup, password }),
  restore: (backup: unknown, password?: string) =>
    api.post<{ restored: BackupCounts; snapshotId: string; fifo: boolean }>('/settings/backup/restore', { backup, password, confirm: true }),
  snapshots: () => api.get<BackupSnapshot[]>('/settings/backup/snapshots'),
  auto: () => api.get<AutoBackupStatus>('/settings/backup/auto'),
  autoRun: () => api.post<{ name: string; rotated: number }>('/settings/backup/auto/run'),
  /** La copia automática se descarga recifrada con la contraseña: así sirve en otro equipo. */
  autoDownload: (name: string, password: string) =>
    api.post<Record<string, unknown>>(`/settings/backup/auto/${encodeURIComponent(name)}/download`, { password }),
  autoRestore: (name: string) =>
    api.post<{ restored: BackupCounts; snapshotId: string; fifo: boolean }>(`/settings/backup/auto/${encodeURIComponent(name)}/restore`, { confirm: true }),
  revert: (id: string) => api.post<{ reverted: boolean; fifo: boolean }>(`/settings/backup/snapshots/${encodeURIComponent(id)}/revert`, { confirm: true }),
}
