import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShortfallBanner } from './ShortfallBanner'

describe('ShortfallBanner (#380)', () => {
  it('sin huecos ni wallet filtrada no muestra nada', () => {
    expect(renderToStaticMarkup(<ShortfallBanner count={0} asset="XRP" onOpenFirst={null} walletFiltered={false} />)).toBe('')
  })

  it('resume los huecos y ofrece abrir la más antigua', () => {
    const html = renderToStaticMarkup(<ShortfallBanner count={2} asset="XRP" onOpenFirst={() => {}} walletFiltered={false} />)
    expect(html).toContain('2 operaciones de XRP sin saldo suficiente')
    expect(html).toContain('Ver la más antigua')
  })

  it('con una wallet filtrada explica de dónde salen las subidas sin fila', () => {
    expect(renderToStaticMarkup(<ShortfallBanner count={0} asset="XRP" onOpenFirst={null} walletFiltered />)).toContain('Saldo de la wallet filtrada')
  })
})
