import { describe, expect, it } from 'vitest'
import { MAX_BACKUP_BYTES, exportPasswordError, formatBytes, parseBackupText } from './backupFile'

// Reconocer el fichero de copia antes de enviarlo (#453). Datos sintéticos.
const HEAD = { format: 'cryptofolio-backup', schema: 20, exported_at: '2026-01-02T03:04:05.000Z' }

describe('parseBackupText', () => {
  it('reconoce una copia cifrada y una en claro', () => {
    expect(parseBackupText(JSON.stringify({ ...HEAD, encrypted: true, payload: 'x' })))
      .toMatchObject({ ok: true, encrypted: true, exportedAt: HEAD.exported_at })
    expect(parseBackupText(JSON.stringify({ ...HEAD, encrypted: false, data: {} }))).toMatchObject({ ok: true, encrypted: false })
  })

  it('rechaza JSON inválido, ficheros ajenos, el formato anterior y los demasiado grandes', () => {
    expect(parseBackupText('{no es json')).toEqual({ ok: false, error: 'El fichero no es un JSON válido.' })
    expect(parseBackupText('{"hola":1}')).toEqual({ ok: false, error: 'El fichero no es una copia de CryptoFolio.' })
    expect(parseBackupText('null')).toEqual({ ok: false, error: 'El fichero no es una copia de CryptoFolio.' })
    expect(parseBackupText(JSON.stringify({ ...HEAD, encrypted: 'si' }))).toMatchObject({ ok: false })
    expect(parseBackupText('{"version":"1.0"}')).toMatchObject({ ok: false, error: expect.stringContaining('formato anterior') })
    expect(parseBackupText('{}', MAX_BACKUP_BYTES + 1)).toEqual({ ok: false, error: 'El fichero supera los 100 MB.' })
  })
})

describe('exportPasswordError', () => {
  it('exige 8 caracteres y que coincidan', () => {
    expect(exportPasswordError('corta', 'corta')).toBe('Al menos 8 caracteres.')
    expect(exportPasswordError('suficiente', 'distinta1')).toBe('Las contraseñas no coinciden.')
    expect(exportPasswordError('suficiente', 'suficiente')).toBeNull()
  })
})

describe('formatBytes (#454)', () => {
  it('en base 1024 con un decimal', () => {
    expect(formatBytes(512)).toBe('512\u00a0B')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2,5\u00a0MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3\u00a0GB')
  })
})
