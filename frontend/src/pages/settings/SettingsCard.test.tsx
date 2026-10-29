import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Palette } from 'lucide-react'
import { SettingsCard } from './SettingsCard'

// Bloque común de Ajustes (#445). Render estático.
describe('SettingsCard (#445)', () => {
  it('superficie ligera, región con su título, icono y entrada escalonada', () => {
    const html = renderToStaticMarkup(<SettingsCard title="Tema" icon={Palette} index={2} description="Texto"><p>x</p></SettingsCard>)
    expect(html).toContain('aria-label="Tema"')
    expect(html).toContain('panel-soft')
    expect(html).toContain('panel-in')
    expect(html).toContain('animation-delay:120ms')
    expect(html).toContain('lucide-palette')
  })

  it('variante de peligro con borde y acento rojos', () => {
    const html = renderToStaticMarkup(<SettingsCard title="Zona de peligro" tone="danger" />)
    expect(html).toContain('--panel:var(--cf-negative)')
    expect(html).toContain('border-negative/30')
    expect(html).toContain('text-negative-ink')
  })

  it('la marca de guardado va junto al título', () => {
    const html = renderToStaticMarkup(<SettingsCard title="Moneda" status={<span data-marca="1" />} />)
    expect(html).toMatch(/<h3[^>]*>Moneda<span data-marca="1">/)
  })
})
