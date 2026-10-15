import { describe, expect, it } from 'vitest'
import { computeTooltipPosition } from './tooltipPosition'

const viewport = { width: 1440, height: 900 }
const size = { width: 256, height: 120 }
const anchor = (left: number, top = 200) => ({ left, top, width: 14, height: 14 })

describe('computeTooltipPosition (#211)', () => {
  it('centrado bajo el disparador cuando cabe', () => {
    const p = computeTooltipPosition({ anchor: anchor(700), size, viewport })
    expect(p.placement).toBe('down')
    expect(p.top).toBe(200 + 14 + 10)
    expect(p.left).toBe(707 - 128)
    expect(p.arrowLeft).toBe(128)
  })

  it('pegado al borde derecho: se desplaza dentro de la ventana y la flecha sigue apuntando al disparador', () => {
    const p = computeTooltipPosition({ anchor: anchor(1420), size, viewport })
    expect(p.left + size.width).toBeLessThanOrEqual(viewport.width - 8)
    expect(p.left).toBe(1440 - 8 - 256)
    // La flecha se acerca todo lo posible al disparador sin salirse de la esquina redondeada.
    expect(p.arrowLeft).toBe(256 - 14)
  })

  it('pegado al borde izquierdo: no empieza antes del margen', () => {
    const p = computeTooltipPosition({ anchor: anchor(2), size, viewport })
    expect(p.left).toBe(8)
    expect(p.arrowLeft).toBeGreaterThanOrEqual(14)
  })

  it('sin sitio debajo: se abre hacia arriba', () => {
    const p = computeTooltipPosition({ anchor: anchor(700, 850), size, viewport })
    expect(p.placement).toBe('up')
    expect(p.top + size.height).toBeLessThanOrEqual(850 - 10)
  })

  it('prefiere arriba si se pide y cabe; si no, abajo', () => {
    expect(computeTooltipPosition({ anchor: anchor(700, 500), size, viewport, preferred: 'up' }).placement).toBe('up')
    expect(computeTooltipPosition({ anchor: anchor(700, 20), size, viewport, preferred: 'up' }).placement).toBe('down')
  })

  it('si no cabe en ningún lado, elige el de más espacio y nunca se sale verticalmente', () => {
    const tall = { width: 256, height: 800 }
    const p = computeTooltipPosition({ anchor: anchor(700, 300), size: tall, viewport })
    expect(p.top).toBeGreaterThanOrEqual(8)
    expect(p.top + tall.height).toBeLessThanOrEqual(viewport.height - 8 + 0.0001)
  })

  it('ventana más estrecha que el tooltip: se alinea al margen izquierdo', () => {
    const p = computeTooltipPosition({ anchor: anchor(100), size, viewport: { width: 200, height: 900 } })
    expect(p.left).toBe(8)
  })
})
