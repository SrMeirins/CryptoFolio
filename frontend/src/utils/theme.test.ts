import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, parseThemePreference, resolveTheme, toggleTarget, writeStoredTheme } from './theme'

describe('parseThemePreference (#197)', () => {
  it('acepta dark, light y system; cualquier otro valor cae en oscuro', () => {
    expect(parseThemePreference('light')).toBe('light')
    expect(parseThemePreference('system')).toBe('system')
    expect(parseThemePreference('dark')).toBe('dark')
    for (const raw of [undefined, null, '', 'Light', 'azul', 1]) expect(parseThemePreference(raw)).toBe('dark')
  })
})

describe('resolveTheme', () => {
  it('sigue la preferencia y, con «system», al sistema operativo', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('toggleTarget', () => {
  it('fija el contrario del tema efectivo (también si la preferencia era «system»)', () => {
    expect(toggleTarget('dark')).toBe('light')
    expect(toggleTarget('light')).toBe('dark')
  })
})

describe('writeStoredTheme', () => {
  it('guarda el tema efectivo y tolera un almacenamiento bloqueado', () => {
    const data: Record<string, string> = {}
    writeStoredTheme({ setItem: (k, v) => { data[k] = v } }, 'light')
    expect(data[THEME_STORAGE_KEY]).toBe('light')
    expect(() => writeStoredTheme({ setItem: () => { throw new Error('bloqueado') } }, 'dark')).not.toThrow()
  })
})
