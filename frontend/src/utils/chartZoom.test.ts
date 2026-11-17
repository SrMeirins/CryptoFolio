import { describe, expect, it } from 'vitest'
import { desplazarVentana, encajar, esCompleta, MIN_SPAN, puntosEnVentana, rangoAVentana, ventanaARango, zoomVentana } from './chartZoom'

// Zoom y desplazamiento del gráfico de precio (#528).
const D = 86_400_000
const extent = { from: 0, to: 400 * D }

describe('zoomVentana', () => {
  it('acerca manteniendo fijo el instante bajo el cursor', () => {
    const v = zoomVentana(extent, extent, 0.5, 100 * D)
    expect(v.to - v.from).toBe(200 * D)
    // El cursor estaba al 25 % de la ventana y sigue al 25 %.
    expect((100 * D - v.from) / (v.to - v.from)).toBeCloseTo(0.25, 9)
  })
  it('no baja del tramo mínimo ni sale de la historia al alejar', () => {
    const cerca = zoomVentana({ from: 10 * D, to: 12 * D }, extent, 0.1, 11 * D)
    expect(cerca.to - cerca.from).toBe(MIN_SPAN)
    expect(zoomVentana({ from: 300 * D, to: 400 * D }, extent, 10, 350 * D)).toEqual(extent)
  })
})

describe('desplazarVentana y encajar', () => {
  it('desplaza sin salirse por ninguno de los dos lados', () => {
    const v = { from: 100 * D, to: 200 * D }
    expect(desplazarVentana(v, extent, 20 * D)).toEqual({ from: 120 * D, to: 220 * D })
    expect(desplazarVentana(v, extent, -500 * D)).toEqual({ from: 0, to: 100 * D })
    expect(desplazarVentana(v, extent, 500 * D)).toEqual({ from: 300 * D, to: 400 * D })
  })
  it('una historia más corta que el tramo mínimo se ve entera', () => {
    expect(encajar({ from: 0, to: D }, { from: 0, to: 2 * D })).toEqual({ from: 0, to: 2 * D })
  })
})

describe('rango común y ventana (#508)', () => {
  const ext = { from: Date.parse('2025-01-01T12:00:00Z'), to: Date.parse('2026-06-15T12:00:00Z') }
  it('un rango da su ventana de días completos; «Todo», la vista completa', () => {
    expect(rangoAVentana({ tipo: 'preset', preset: 'todo' }, '2026-06-15')).toBeNull()
    expect(rangoAVentana({ tipo: 'preset', preset: '7d' }, '2026-06-15')).toEqual({
      from: Date.parse('2026-06-09T00:00:00Z'), to: Date.parse('2026-06-15T23:59:59Z'),
    })
  })
  it('una ventana de zoom es un rango personalizado; si llega al final, «Hasta hoy»', () => {
    expect(ventanaARango({ from: Date.parse('2025-03-01T12:00:00Z'), to: Date.parse('2025-04-01T12:00:00Z') }, ext))
      .toEqual({ tipo: 'rango', from: '2025-03-01', to: '2025-04-01', hastaHoy: false })
    expect(ventanaARango({ from: Date.parse('2026-05-01T12:00:00Z'), to: ext.to }, ext)).toMatchObject({ hastaHoy: true })
    expect(ventanaARango(ext, ext)).toEqual({ tipo: 'preset', preset: 'todo' })
    expect(ventanaARango(null, ext)).toEqual({ tipo: 'preset', preset: 'todo' })
    expect(esCompleta({ from: 0, to: D }, { from: 0, to: 400 * D })).toBe(false)
  })
})

describe('puntosEnVentana', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ t: i * D, price: i }))
  it('incluye un vecino a cada lado para que la línea llegue a los bordes', () => {
    expect(puntosEnVentana(pts, { from: 3.5 * D, to: 5.5 * D }).map(p => p.price)).toEqual([3, 4, 5, 6])
    expect(puntosEnVentana(pts, { from: 0, to: 2 * D }).map(p => p.price)).toEqual([0, 1, 2, 3])
    expect(puntosEnVentana(pts, { from: 20 * D, to: 30 * D }).map(p => p.price)).toEqual([9])
  })
})
