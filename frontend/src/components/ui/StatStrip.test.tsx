import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { StatStrip, type StatStripCell } from './StatStrip'
import { cellActionLabel } from './statStripLogic'

// Tira de métricas común (#490). Render estático con datos sintéticos.
const render = (cells: StatStripCell[]) =>
  renderToStaticMarkup(<MemoryRouter><StatStrip label="Resumen" cells={cells} /></MemoryRouter>)

describe('StatStrip (#490)', () => {
  it('lista con nombre, una celda por métrica con etiqueta, cifra y línea secundaria', () => {
    const html = render([
      { key: 'a', label: 'Operaciones', value: '12', sub: 'en 2025' },
      { key: 'b', label: 'Activos', value: '4' },
    ])
    expect(html).toContain('aria-label="Resumen"')
    expect(html.match(/<li/g)).toHaveLength(2)
    expect(html).toContain('Operaciones')
    expect(html).toContain('en 2025')
  })

  it('el tono nunca va solo en el color: icono y texto para el lector de pantalla', () => {
    const html = render([
      { key: 'a', label: 'P&L', value: '+10 €', tone: 'positive' },
      { key: 'b', label: 'Pérdidas', value: '-5 €', tone: 'negative' },
      { key: 'c', label: 'Caduca', value: '3', tone: 'warning' },
    ])
    expect(html).toContain('(positivo)')
    expect(html).toContain('(negativo)')
    expect(html).toContain('(requiere atención)')
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('celda pulsable: enlace o botón con su destino anunciado; sin destino, no es interactiva', () => {
    const html = render([
      { key: 'a', label: 'Pérdidas', value: '3', to: '/fiscal?vista=operaciones', destination: 'Operaciones' },
      { key: 'b', label: 'Ventas', value: '2', onSelect: () => {}, destination: 'Historial' },
      { key: 'c', label: 'Fijo', value: '1' },
    ])
    expect(html).toContain('href="/fiscal?vista=operaciones"')
    expect(html).toContain('aria-label="Ver Pérdidas en Operaciones"')
    expect(html).toContain('<button type="button" aria-label="Ver Ventas en Historial"')
    expect(html.match(/<a |<button/g)).toHaveLength(2)
  })

  it('con un número impar de celdas rellena el hueco de la rejilla móvil', () => {
    const html = render([1, 2, 3].map(i => ({ key: String(i), label: `M${i}`, value: String(i) })))
    expect(html).toContain('aria-hidden="true" class="bg-background-card sm:hidden"')
    expect(html).toContain('sm:grid-cols-3')
  })

  it('nombre accesible sin destino', () => {
    expect(cellActionLabel({ label: 'Ventas' })).toBe('Ver Ventas')
  })
})
