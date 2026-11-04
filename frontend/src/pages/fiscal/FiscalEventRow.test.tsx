import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClaveCell } from './FiscalEventRow'
import type { FiscalEvent } from './types'

// Clave de la casilla 1800 en la tabla de Operaciones (#531). Datos sintéticos.
const ev = (clave: string, descripcion: string, revisar = false) =>
  ({ contrapartidaClave: clave, contrapartidaDescripcion: descripcion, contrapartidaRevisar: revisar }) as FiscalEvent

describe('ClaveCell', () => {
  it('muestra la letra con su significado como nombre accesible', () => {
    const html = renderToStaticMarkup(<ClaveCell e={ev('F', 'Moneda de curso legal, EUR (F)')} />)
    expect(html).toContain('>F<')
    expect(html).toContain('aria-label="Clave F: Moneda de curso legal, EUR (F)"')
  })
  it('sin clave segura muestra «Revisar»', () => {
    const html = renderToStaticMarkup(<ClaveCell e={ev('', 'Donación: sin contraprestación, revisar con un asesor', true)} />)
    expect(html).toContain('>Revisar<')
    expect(html).toContain('Clave por revisar')
  })
})
