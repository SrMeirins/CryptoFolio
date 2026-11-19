import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { BarraResultados } from './BarraResultados'

// Ganancias frente a pérdidas (#515), con datos sintéticos.
const render = (gains: number, losses: number) => renderToStaticMarkup(
  <MemoryRouter>
    <BarraResultados gains={gains} losses={losses} recuento={{ ganancias: 2, perdidas: 0 }}
      enlaces={{ ganancias: '/fiscal?resultado=ganancia', perdidas: '/fiscal?resultado=perdida' }} />
  </MemoryRouter>,
)

describe('BarraResultados', () => {
  it('sin pérdidas no pinta «−0,00 €» (el caso que detectó el CI)', () => {
    const html = render(150, 0)
    expect(html).not.toMatch(/[-−]0,00/)
    expect(html).toContain('0 operaciones')
  })
  it('cada parte enlaza a Operaciones filtrada, con su nombre', () => {
    const html = render(150, -40)
    expect(html).toContain('href="/fiscal?resultado=ganancia"')
    expect(html).toContain('Ver las operaciones con pérdida en Fiscal')
    expect(html).toMatch(/−40,00/)
  })
})
