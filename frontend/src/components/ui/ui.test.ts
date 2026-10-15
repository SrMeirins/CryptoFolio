import { describe, expect, it } from 'vitest'
import {
  badgeClasses, buttonClasses, cardClasses, fieldClasses, iconButtonClasses, modalOverlayClasses, modalPanelClasses, panelClasses, panelEnterStyle, segmentClasses, segmentThumbClasses,
  skeletonClasses, stateClasses, tabClasses, tabId, tabPanelId, tableFootRowClasses, tableHeadRowClasses, tableRowClasses,
} from './classes'

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

describe('fieldClasses (#199)', () => {
  it('foco visible con la marca y estado deshabilitado', () => {
    const c = fieldClasses()
    expect(c).toContain('focus:border-brand')
    expect(c).toContain('focus-visible:ring-2')
    expect(c).toContain('disabled:opacity-50')
    expect(c).not.toMatch(THEME_ONLY)
  })
  it('estado de error en rojo, sin el borde normal', () => {
    const c = fieldClasses('md', true)
    expect(c).toContain('border-negative/60')
    expect(c).not.toMatch(/(^|\s)border-border(\s|$)/)
  })
  it('tamaños y clases extra (p. ej. hueco para un icono)', () => {
    expect(fieldClasses('sm')).toContain('text-xs')
    const c = fieldClasses('sm', false, 'pl-7 flex-1')
    expect(c).toContain('pl-7')
    expect(c).toContain('flex-1')
  })
})

describe('modal', () => {
  it('hoja inferior en móvil y centrado desde sm, con fichas del tema', () => {
    expect(modalOverlayClasses()).toContain('items-end sm:items-center')
    const c = modalPanelClasses('md')
    expect(c).toContain('bg-background-card')
    expect(c).toContain('rounded-t-xl sm:rounded-xl')
    expect(c).not.toMatch(THEME_ONLY)
  })
  it('cada tamaño fija su ancho máximo y las clases extra lo sustituyen', () => {
    expect(modalPanelClasses('sm')).toContain('sm:max-w-sm')
    expect(modalPanelClasses('lg')).toContain('sm:max-w-2xl')
    expect(modalPanelClasses('xl')).toContain('sm:max-w-4xl')
    const c = modalPanelClasses('md', 'bg-background-primary')
    expect(c).toContain('bg-background-primary')
    expect(c).not.toContain('bg-background-card')
  })
})

describe('tablas', () => {
  it('cabecera, fila y pie comparten fichas del tema', () => {
    for (const c of [tableHeadRowClasses(), tableRowClasses(), tableFootRowClasses()]) expect(c).not.toMatch(THEME_ONLY)
    expect(tableHeadRowClasses()).toContain('uppercase')
  })
  it('fila interactiva con cursor y fila expandida resaltada', () => {
    expect(tableRowClasses()).not.toContain('cursor-pointer')
    expect(tableRowClasses(true)).toContain('cursor-pointer')
    expect(tableRowClasses(false, true)).toContain('bg-background-tertiary/40')
  })
})

describe('estados', () => {
  it('skeleton sin animación cuando el usuario reduce movimiento', () => {
    expect(skeletonClasses()).toContain('motion-reduce:animate-none')
    expect(skeletonClasses('h-4 w-48 rounded-full')).toContain('rounded-full')
    expect(skeletonClasses('rounded-full')).not.toContain('rounded-lg')
  })
  it('versión compacta con menos aire vertical', () => {
    expect(stateClasses()).toContain('py-16')
    expect(stateClasses(true)).toContain('py-8')
  })
})

describe('selector segmentado, variante accent (#200)', () => {
  it('la opción activa usa el color de acento y queda sobre el indicador deslizante', () => {
    expect(segmentClasses(true, 'sm', 'accent')).toContain('text-brand')
    expect(segmentClasses(true, 'sm', 'accent')).toContain('z-10')
    expect(segmentClasses(true, 'sm', 'accent')).not.toContain('bg-background-card')
    expect(segmentClasses(false, 'sm', 'accent')).toContain('text-fg-subtle')
  })
  it('el indicador se anima y respeta «reducir movimiento»', () => {
    expect(segmentThumbClasses()).toContain('transition-[transform,width]')
    expect(segmentThumbClasses()).toContain('motion-reduce:transition-none')
    expect(segmentThumbClasses()).not.toMatch(THEME_ONLY)
  })
})

describe('paneles (#232)', () => {
  it('entrada escalonada: 60 ms por posición, acotada', () => {
    expect(panelEnterStyle(0)).toEqual({ animationDelay: '0ms' })
    expect(panelEnterStyle(3)).toEqual({ animationDelay: '180ms' })
    expect(panelEnterStyle(99)).toEqual({ animationDelay: '720ms' })
    expect(panelEnterStyle(-2)).toEqual({ animationDelay: '0ms' })
  })
  it('animación de entrada y sombra al pasar el cursor, con clases extra', () => {
    const c = panelClasses('rounded-xl lg:col-span-2')
    expect(c).toContain('panel-in')
    expect(c).toContain('hover:shadow-lg')
    expect(c).toContain('lg:col-span-2')
  })
})
