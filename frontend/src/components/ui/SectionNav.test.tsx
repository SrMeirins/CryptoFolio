import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Coins, Wallet } from 'lucide-react'
import { SectionNav } from './SectionNav'
import { ViewTabs } from './Tabs'

// Norma de selección (#492): niveles 1 y 2. Render estático con datos sintéticos.
describe('SectionNav (nivel 1)', () => {
  const html = renderToStaticMarkup(
    <SectionNav label="Secciones" idBase="sec" value="b" onChange={() => {}}
      items={[{ value: 'a', label: 'Wallets', icon: Wallet, hint: '2 wallets' }, { value: 'b', label: 'Activos', icon: Coins, badge: <span>3</span> }]} />)
  it('tablist con nombre y una pestaña por sección', () => {
    expect(html).toContain('role="tablist" aria-label="Secciones"')
    expect(html.match(/role="tab"/g)).toHaveLength(2)
  })
  it('solo la activa entra en el orden de tabulación y todas controlan el panel', () => {
    expect(html).toContain('id="sec-tab-b" type="button" role="tab" aria-selected="true" aria-controls="sec-panel" tabindex="0"')
    expect(html).toContain('id="sec-tab-a" type="button" role="tab" aria-selected="false" aria-controls="sec-panel" tabindex="-1"')
  })
  it('dato corto e insignia', () => {
    expect(html).toContain('2 wallets')
    expect(html).toContain('<span>3</span>')
  })
})

describe('ViewTabs (nivel 2)', () => {
  it('pestañas subrayadas con su panel', () => {
    const html = renderToStaticMarkup(<ViewTabs label="Vistas" idBase="v" value="x" onChange={() => {}}
      items={[{ value: 'x', label: 'Uno' }, { value: 'y', label: 'Dos' }]} />)
    expect(html).toContain('role="tablist" aria-label="Vistas"')
    expect(html).toContain('border-b border-border')
    expect(html).toContain('aria-controls="v-panel"')
  })
})
