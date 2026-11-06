import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContenidoTema } from './ContenidoTema'
import { TEMAS_METODO, temaHeadingId } from './temas'

// Contenido de «Cómo calculamos» (#493): todos los temas de la issue, con su
// ejemplo, y según la guía de estilo de textos (sin raya larga ni flechas).
describe('Cómo calculamos (#493)', () => {
  it('cubre los cinco temas en orden y con id de encabezado único', () => {
    expect(TEMAS_METODO.map(t => t.id)).toEqual(['fifo', 'valoracion', 'rentabilidad', 'compensacion', 'modelo721'])
    expect(new Set(TEMAS_METODO.map(t => temaHeadingId(t.id))).size).toBe(5)
  })

  it.each(TEMAS_METODO.map(t => t.id))('%s: tiene texto y un ejemplo, sin raya larga ni flechas', tema => {
    const html = renderToStaticMarkup(<ContenidoTema tema={tema} />)
    expect(html).toContain('Ejemplo. ')
    expect(html).not.toMatch(/[—→←⇒›]/)
  })

  it('las reglas fiscales citan su norma', () => {
    expect(renderToStaticMarkup(<ContenidoTema tema="fifo" />)).toContain('art. 37.2')
    expect(renderToStaticMarkup(<ContenidoTema tema="compensacion" />)).toContain('arts. 48 y 49')
  })
})
