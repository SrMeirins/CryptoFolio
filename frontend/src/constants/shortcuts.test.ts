import { describe, expect, it } from 'vitest'
import { atajosDe, ATAJOS_GENERALES } from './shortcuts'

// Panel de atajos (#535).
describe('atajos por pantalla (#535)', () => {
  it('en Fiscal, los suyos y los generales', () => {
    const g = atajosDe('/fiscal')
    expect(g.map(x => x.titulo)).toEqual(['Fiscal', 'En toda la aplicación'])
    expect(g[0].atajos.some(([t]) => t.includes('1'))).toBe(true)
  })

  it('en una pantalla sin atajos propios, solo los generales', () => {
    expect(atajosDe('/settings')).toEqual([ATAJOS_GENERALES])
  })

  it('en el Historial, sus atajos agrupados por tarea (#552) y los generales', () => {
    const g = atajosDe('/history')
    expect(g.map(x => x.titulo)).toEqual(['Historial: buscar y filtrar', 'Historial: vistas guardadas', 'Historial: tabla y detalle', 'En toda la aplicación'])
    expect(g.every(x => x.atajos.length > 0)).toBe(true)
  })

  it('la tecla «?» abre la ayuda en toda la app', () => {
    expect(ATAJOS_GENERALES.atajos.some(([t]) => t.includes('?'))).toBe(true)
  })
})
