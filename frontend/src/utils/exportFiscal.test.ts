import { describe, expect, it } from 'vitest'
import { leerPrefs, nombrePorDefecto, PREFS_POR_DEFECTO, rutaExport } from './exportFiscal'

// Exportación fiscal (#547).
describe('exportFiscal', () => {
  it('preferencias guardadas; si faltan o no valen, las de por defecto', () => {
    expect(leerPrefs(JSON.stringify({ formato: 'pdf', secciones: ['lotes', 'resumen'] }))).toEqual({ formato: 'pdf', secciones: ['resumen', 'lotes'] })
    expect(leerPrefs(undefined)).toEqual(PREFS_POR_DEFECTO)
    expect(leerPrefs('{roto')).toEqual(PREFS_POR_DEFECTO)
    expect(leerPrefs(JSON.stringify({ formato: 'xml', secciones: ['resumen'] }))).toEqual(PREFS_POR_DEFECTO)
    expect(leerPrefs(JSON.stringify({ formato: 'pdf', secciones: [] }))).toEqual(PREFS_POR_DEFECTO)
  })
  it('las secciones solo van en Excel y PDF, en su orden', () => {
    expect(rutaExport(2025, { formato: 'excel', secciones: ['operaciones', 'resumen'] })).toBe('/fiscal/2025/export?format=excel&secciones=resumen,operaciones')
    expect(rutaExport(2025, { formato: 'csv', secciones: ['resumen'] })).toBe('/fiscal/2025/export?format=csv')
    expect(nombrePorDefecto(2025, 'rentaweb')).toBe('fiscal_2025_rentaweb.csv')
  })
})
