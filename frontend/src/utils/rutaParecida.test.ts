import { describe, expect, it } from 'vitest'
import { distancia, rutaParecida } from './rutaParecida'

// Sugerencia de la página «no encontrada» (#487).
describe('distancia', () => {
  it('cuenta inserciones, borrados y sustituciones', () => {
    expect(distancia('portfolio', 'portfolio')).toBe(0)
    expect(distancia('portfolioo', 'portfolio')).toBe(1)
    expect(distancia('fsical', 'fiscal')).toBe(2)
    expect(distancia('', 'abc')).toBe(3)
  })
})

describe('rutaParecida', () => {
  it('sugiere la página con una o dos letras de diferencia', () => {
    expect(rutaParecida('/portfolioo')).toEqual({ to: '/portfolio', label: 'Portfolio' })
    expect(rutaParecida('/fiscl')).toEqual({ to: '/fiscal', label: 'Fiscal' })
    expect(rutaParecida('/historyy/algo')).toEqual({ to: '/history', label: 'Historial' })
  })
  it('también por el nombre en castellano y sin distinguir mayúsculas', () => {
    expect(rutaParecida('/historial')).toEqual({ to: '/history', label: 'Historial' })
    expect(rutaParecida('/AJUSTES')).toEqual({ to: '/settings', label: 'Ajustes' })
    expect(rutaParecida('/importar')).toEqual({ to: '/import', label: 'Importar' })
  })
  it('sin parecido, sin sugerencia', () => {
    expect(rutaParecida('/zzzzzzzz')).toBeNull()
    expect(rutaParecida('/')).toBeNull()
  })
})
