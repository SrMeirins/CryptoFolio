import { describe, expect, it } from 'vitest'
import { isSearchShortcut, readDensity, readDustOpen, readView, saveDensity, saveDustOpen, saveView } from './portfolioPrefs'

// Preferencias de Portfolio y atajo del buscador (#269).
const key = (k: string, target: object | null = { tagName: 'BODY' }, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: target as EventTarget | null, ...mods })

describe('isSearchShortcut', () => {
  it('«/» fuera de un campo enfoca el buscador', () => {
    expect(isSearchShortcut(key('/'))).toBe(true)
    expect(isSearchShortcut(key('/', null))).toBe(true)
  })
  it('no interfiere al escribir ni con modificadores u otras teclas', () => {
    expect(isSearchShortcut(key('/', { tagName: 'INPUT' }))).toBe(false)
    expect(isSearchShortcut(key('/', { tagName: 'TEXTAREA' }))).toBe(false)
    expect(isSearchShortcut(key('/', { tagName: 'DIV', isContentEditable: true }))).toBe(false)
    expect(isSearchShortcut(key('/', undefined, { ctrlKey: true }))).toBe(false)
    expect(isSearchShortcut(key('a'))).toBe(false)
  })
})

describe('preferencias sin almacenamiento disponible', () => {
  it('valores por defecto y guardar no falla', () => {
    expect(readDensity()).toBe('comfortable')
    expect(readDustOpen()).toBe(false)
    expect(readView()).toBe('asset')
    expect(() => { saveDensity('compact'); saveDustOpen(true); saveView('wallet') }).not.toThrow()
  })
})
