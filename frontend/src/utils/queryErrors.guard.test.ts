import { describe, expect, it } from 'vitest'

// Guarda de #498: toda consulta trata su fallo (QueryError con Reintentar,
// `failure`, o `isError` con su mensaje) o es una consulta de fondo con valor
// por defecto, marcada con el comentario «consulta de fondo (#498)» y su motivo.
const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const USA_CONSULTA = /\b(useQuery|useCurrencyQuery)\(/
const TRATA_FALLO = /\bfailure\(|<QueryError\b|\bisError\b|\bonRetry\b/
const DE_FONDO = /consulta de fondo \(#498\):/

describe('cada consulta trata su fallo (#498)', () => {
  const ficheros = Object.entries(FUENTES)
    .filter(([ruta]) => !/\.test\.tsx?$/.test(ruta) && !ruta.endsWith('/hooks/useCurrencyQuery.ts'))
    .filter(([, src]) => USA_CONSULTA.test(src))

  it('hay consultas que revisar', () => {
    expect(ficheros.length).toBeGreaterThan(30)
  })

  it('ningún fichero con consultas deja el fallo sin tratar ni justificar', () => {
    const sinTratar = ficheros.filter(([, src]) => !TRATA_FALLO.test(src) && !DE_FONDO.test(src)).map(([ruta]) => ruta)
    expect(sinTratar).toEqual([])
  })
})
