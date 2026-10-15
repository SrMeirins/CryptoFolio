import { describe, expect, it } from 'vitest'
import { computePopoverPosition } from './popoverPosition'

// Colocación del Popover (#240).
const viewport = { width: 1200, height: 800 }
const size = { width: 280, height: 300 }

describe('computePopoverPosition', () => {
  it('debajo del botón si cabe, alineado a su izquierda', () => {
    const p = computePopoverPosition({ anchor: { top: 100, left: 400, width: 90, height: 32 }, size, viewport })
    expect(p).toMatchObject({ placement: 'down', top: 138, left: 400 })
    expect(p.maxHeight).toBe(800 - 132 - 6 - 8)
  })

  it('encima si no cabe debajo y hay más sitio arriba (el caso del rango que se cortaba)', () => {
    const p = computePopoverPosition({ anchor: { top: 700, left: 400, width: 90, height: 32 }, size, viewport })
    expect(p.placement).toBe('up')
    expect(p.top).toBe(700 - 6 - 300)
  })

  it('alineado al borde derecho del botón y siempre dentro de la ventana', () => {
    expect(computePopoverPosition({ anchor: { top: 100, left: 900, width: 100, height: 32 }, size, viewport, align: 'end' }).left).toBe(720)
    expect(computePopoverPosition({ anchor: { top: 100, left: 1150, width: 40, height: 32 }, size, viewport }).left).toBe(1200 - 280 - 8)
    expect(computePopoverPosition({ anchor: { top: 100, left: 2, width: 40, height: 32 }, size, viewport, align: 'end' }).left).toBe(8)
  })

  it('si no cabe en ningún lado, usa el de más espacio y limita la altura (con scroll interno)', () => {
    const p = computePopoverPosition({ anchor: { top: 380, left: 100, width: 90, height: 32 }, size: { width: 200, height: 600 }, viewport })
    expect(p.placement).toBe('down')
    expect(p.maxHeight).toBe(800 - 412 - 14)
    const q = computePopoverPosition({ anchor: { top: 500, left: 100, width: 90, height: 32 }, size: { width: 200, height: 600 }, viewport })
    expect(q.placement).toBe('up')
    expect(q.top).toBe(8)
  })
})
