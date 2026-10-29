import { describe, expect, it } from 'vitest'

// Guardián (#390): la zona de la aplicación es configurable, así que la cadena
// 'Europe/Madrid' solo puede aparecer en su constante por defecto. Se buscan
// cadenas exactas, no comentarios. Las fuentes se leen con Vite (sin Node).
const sources = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const ALLOWED = new Set(['./constants/timezone.ts'])

describe('sin zona horaria fija en el frontend (#390)', () => {
  it('revisa las fuentes de la aplicación', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(Object.keys(sources)).toContain('./constants/timezone.ts')
  })

  it("'Europe/Madrid' solo está en la constante por defecto", () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !ALLOWED.has(file))
      .filter(([, text]) => /(['"`])Europe\/Madrid\1/.test(text))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
