import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import { APP_VERSION, backupFilename } from './appInfo'

// Datos de la app (#444): versión de la build y nombre de la copia.
describe('appInfo', () => {
  it('la versión es la de package.json, no una fija', () => {
    expect(APP_VERSION).toBe(pkg.version)
    expect(APP_VERSION).not.toBe('0.3.0-dev')
  })

  it('la copia se llama cryptofolio-backup con la fecha en UTC', () => {
    expect(backupFilename(new Date('2026-03-05T23:30:00Z'))).toBe('cryptofolio-backup-2026-03-05.json')
  })
})
