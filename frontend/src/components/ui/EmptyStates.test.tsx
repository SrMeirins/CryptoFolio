import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FilteredEmpty, NotApplicable } from './States'

// Norma de vacíos (#496). Render estático con textos sintéticos.
describe('vacíos por filtros y «no aplica» (#496)', () => {
  it('el vacío por filtros resume los filtros y siempre ofrece «Quitar filtros»', () => {
    const html = renderToStaticMarkup(<FilteredEmpty summary="Filtros: búsqueda «AAA»." onClear={vi.fn()} />)
    expect(html).toContain('data-empty="filtros"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Sin resultados con estos filtros')
    expect(html).toContain('Filtros: búsqueda «AAA».')
    expect(html).toMatch(/<button[^>]*>Quitar filtros<\/button>/)
  })

  it('sin resumen sigue ofreciendo «Quitar filtros»', () => {
    expect(renderToStaticMarkup(<FilteredEmpty onClear={vi.fn()} />)).toContain('Quitar filtros')
  })

  it('«no aplica» es texto neutro sin acción', () => {
    const html = renderToStaticMarkup(<NotApplicable>Sin ventas en 2023.</NotApplicable>)
    expect(html).toContain('data-empty="no-aplica"')
    expect(html).toContain('Sin ventas en 2023.')
    expect(html).not.toContain('<button')
  })
})
