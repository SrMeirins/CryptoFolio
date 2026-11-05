import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Wallet } from 'lucide-react'
import { PageHeader, SectionHeader } from './PageHeader'

// Cabeceras comunes (#491). Render estático: sin matchMedia es la vista de escritorio.
describe('PageHeader', () => {
  it('un h1 con etiqueta superior, pastillas, subtítulo y acciones en orden', () => {
    const html = renderToStaticMarkup(
      <PageHeader icon={Wallet} title="Portfolio" eyebrow="Ejercicio 2026" subtitle="13 activos · 4 wallets"
        badges={<span>vivo</span>} actions={<button type="button">Nueva</button>} secondaryActions={<button type="button">Exportar</button>} />)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).not.toContain('<h2')
    const orden = ['Ejercicio 2026', 'Portfolio', 'vivo', '13 activos', 'Exportar', 'Nueva'].map(t => html.indexOf(t))
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
  })
  it('sin acciones no pinta el contenedor de acciones', () => {
    expect(renderToStaticMarkup(<PageHeader icon={Wallet} title="Ajustes" />)).not.toContain('max-w-full')
  })
})

describe('SectionHeader', () => {
  it('un h2 con su id para aria-labelledby, mismo orden de huecos', () => {
    const html = renderToStaticMarkup(<SectionHeader id="sec-datos" title="Datos" eyebrow="Ajustes" subtitle="Copias" />)
    expect(html).toContain('<h2 id="sec-datos"')
    expect(html).not.toContain('<h1')
    expect(html.indexOf('Ajustes')).toBeLessThan(html.indexOf('Datos'))
    expect(html.indexOf('Datos')).toBeLessThan(html.indexOf('Copias'))
  })
})
