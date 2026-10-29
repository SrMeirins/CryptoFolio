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

export const backupApi = {
  /** Con contraseña, la copia sale cifrada; va en el cuerpo, nunca en la URL. */
  export: (password?: string) => api.post<Record<string, unknown>>('/settings/backup', password ? { password } : {}),
  preview: (backup: unknown, password?: string) => api.post<BackupPreview>('/settings/backup/preview', { backup, password }),
  restore: (backup: unknown, password?: string) =>
    api.post<{ restored: BackupCounts; snapshotId: string; fifo: boolean }>('/settings/backup/restore', { backup, password, confirm: true }),
  snapshots: () => api.get<BackupSnapshot[]>('/settings/backup/snapshots'),
  revert: (id: string) => api.post<{ reverted: boolean; fifo: boolean }>(`/settings/backup/snapshots/${encodeURIComponent(id)}/revert`, { confirm: true }),
}
