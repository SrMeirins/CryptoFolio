import { describe, expect, it } from 'vitest'
import { badgeClasses, buttonClasses, cardClasses, iconButtonClasses, segmentClasses, tabClasses, tabId, tabPanelId } from './classes'

// Variantes de los componentes base (#199): solo fichas del tema, foco visible
// y estados deshabilitados coherentes.
const THEME_ONLY = /(?:^|\s)(?:[a-z-]+:)*(?:text|bg|border|ring)-(white|black|gray-\d{3}|accent-(?:blue|green|red|amber))\b/

describe('buttonClasses', () => {
  it('cada variante usa solo fichas del tema y el texto adecuado sobre fondos sólidos', () => {
    expect(buttonClasses('primary')).toContain('bg-brand-solid text-on-brand')
    expect(buttonClasses('danger')).toContain('bg-negative text-on-negative')
    expect(buttonClasses('success')).toContain('bg-positive text-on-positive')
    for (const v of ['primary', 'secondary', 'ghost', 'danger', 'success'] as const) expect(buttonClasses(v)).not.toMatch(THEME_ONLY)
  })

  it('foco visible, estado deshabilitado y radio de control (8 px)', () => {
    const c = buttonClasses()
    expect(c).toContain('focus-visible:ring-2')
    expect(c).toContain('disabled:opacity-40')
    expect(c).toContain('rounded-lg')
  })

  it('tamaños y clases extra', () => {
    expect(buttonClasses('ghost', 'sm')).toContain('text-xs')
    expect(buttonClasses('ghost', 'lg', 'w-full')).toMatch(/w-full$/)
  })
})

describe('iconButtonClasses / cardClasses / badgeClasses', () => {
  it('botón de icono activo e inactivo', () => {
    expect(iconButtonClasses('md', true)).toContain('bg-background-tertiary text-fg')
    expect(iconButtonClasses('sm')).toContain('p-1')
  })

  it('tarjeta con radio de 12 px y relleno configurable', () => {
    expect(cardClasses()).toContain('rounded-xl')
    expect(cardClasses('none')).not.toMatch(/\bp-\d/)
    expect(cardClasses('sm')).toContain('p-4')
  })

  it('insignias: un tono por significado, sin colores fijos', () => {
    for (const t of ['neutral', 'brand', 'info', 'positive', 'negative', 'warning', 'purple'] as const) {
      expect(badgeClasses(t)).not.toMatch(THEME_ONLY)
    }
    expect(badgeClasses('negative')).toContain('text-negative')
  })
})

describe('segmentClasses / tabClasses', () => {
  it('la opción activa se distingue y las demás tienen texto legible', () => {
    expect(segmentClasses(true)).toContain('text-fg')
    expect(segmentClasses(false)).toContain('text-fg-subtle')
    expect(segmentClasses(false, 'md')).toContain('text-sm')
  })

  it('pestañas en píldora y subrayadas', () => {
    expect(tabClasses(true)).toContain('text-brand')
    expect(tabClasses(true, 'underline')).toContain('border-brand')
    expect(tabClasses(false, 'underline')).toContain('border-transparent')
  })

  it('ids de pestaña y panel para aria-controls', () => {
    expect(tabId('x', 'pnl')).toBe('x-tab-pnl')
    expect(tabPanelId('x')).toBe('x-panel')
  })
})

describe('fusión de clases extra (tailwind-merge)', () => {
  it('las clases extra sustituyen a las del componente en conflicto', () => {
    const c = buttonClasses('primary', 'md', 'px-6 gap-1.5')
    expect(c).toContain('px-6')
    expect(c).not.toMatch(/(^|\s)px-4(\s|$)/)
    expect(c).toContain('gap-1.5')
    expect(c).not.toMatch(/(^|\s)gap-2(\s|$)/)
    expect(cardClasses('md', 'p-6')).not.toMatch(/(^|\s)p-5(\s|$)/)
  })

  it('no confunde los colores del tema con tamaños de texto', () => {
    const c = buttonClasses('secondary', 'sm')
    expect(c).toContain('text-fg')
    expect(c).toContain('text-xs')
    expect(badgeClasses('negative')).toContain('text-negative')
    expect(badgeClasses('negative')).toContain('text-xs')
  })

  it('un color de fondo extra sustituye al de la tarjeta', () => {
    expect(cardClasses('none', 'bg-warning/2')).not.toContain('bg-background-card')
  })
})

describe('iconButtonClasses — tonos (#199)', () => {
  it('neutro, destructivo, de confirmación y de marca', () => {
    expect(iconButtonClasses('sm', false, '', 'danger')).toContain('hover:text-negative')
    expect(iconButtonClasses('sm', false, '', 'positive')).toContain('text-positive')
    expect(iconButtonClasses('sm', false, '', 'brand')).toContain('hover:text-brand')
    expect(iconButtonClasses()).toContain('hover:text-fg')
  })
  it('las clases de posición extra se conservan', () => {
    expect(iconButtonClasses('sm', false, 'absolute right-2')).toContain('absolute right-2')
  })
})
