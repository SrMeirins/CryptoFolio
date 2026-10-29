import { describe, expect, it } from 'vitest'
import { historyShortcut, nextRowIndex, type KeyLike } from './shortcutKeys'

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike =>
  ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, ...extra })
// Elementos mínimos con lo que miran isTypingTarget y closest.
const el = (tag: string, inside: string | null = null) =>
  ({ tagName: tag, isContentEditable: false, closest: (sel: string) => (inside && sel.includes(inside) ? {} : null) }) as unknown as Element

describe('historyShortcut (#382)', () => {
  it('asigna cada tecla a su atajo', () => {
    expect(historyShortcut(key('/'), el('BODY'), false)).toBe('search')
    expect(historyShortcut(key('?', { shiftKey: true }), el('BODY'), false)).toBe('help')
    expect(historyShortcut(key('ArrowLeft'), el('BUTTON'), false)).toBe('yearPrev')
    expect(historyShortcut(key('ArrowRight'), el('BUTTON'), false)).toBe('yearNext')
    expect(historyShortcut(key('a'), el('BODY'), false)).toBeNull()
  })

  it('no actúa mientras se escribe', () => {
    expect(historyShortcut(key('/'), el('INPUT'), false)).toBeNull()
    expect(historyShortcut(key('ArrowLeft'), el('TEXTAREA'), false)).toBeNull()
  })

  it('no actúa con modificadores ni ya gestionada', () => {
    expect(historyShortcut(key('ArrowLeft', { ctrlKey: true }), el('BODY'), false)).toBeNull()
    expect(historyShortcut(key('ArrowLeft', { shiftKey: true }), el('BODY'), false)).toBeNull()
    expect(historyShortcut(key('/', { defaultPrevented: true }), el('BODY'), false)).toBeNull()
  })

  it('no actúa con un diálogo abierto ni dentro de menús, listas o pestañas', () => {
    expect(historyShortcut(key('ArrowLeft'), el('BODY'), true)).toBeNull()
    expect(historyShortcut(key('ArrowLeft'), el('BUTTON', 'listbox'), false)).toBeNull()
    expect(historyShortcut(key('ArrowLeft'), el('BUTTON', 'tablist'), false)).toBeNull()
  })
})

describe('nextRowIndex (#382)', () => {
  it('mueve entre filas sin salirse de la tabla', () => {
    expect(nextRowIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextRowIndex('ArrowDown', 2, 3)).toBe(2)
    expect(nextRowIndex('ArrowUp', 0, 3)).toBe(0)
    expect(nextRowIndex('Home', 2, 3)).toBe(0)
    expect(nextRowIndex('End', 0, 3)).toBe(2)
  })

  it('otras teclas o tabla vacía no mueven', () => {
    expect(nextRowIndex('Enter', 0, 3)).toBeNull()
    expect(nextRowIndex('ArrowDown', 0, 0)).toBeNull()
  })
})
