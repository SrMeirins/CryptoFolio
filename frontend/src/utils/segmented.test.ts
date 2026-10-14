import { describe, expect, it } from 'vitest'
import { optionForKey } from './segmented'

describe('optionForKey (#197)', () => {
  const opts = ['dark', 'light', 'system'] as const
  it('flechas circulares e Inicio/Fin', () => {
    expect(optionForKey(opts, 'dark', 'ArrowRight')).toBe('light')
    expect(optionForKey(opts, 'system', 'ArrowRight')).toBe('dark')
    expect(optionForKey(opts, 'dark', 'ArrowLeft')).toBe('system')
    expect(optionForKey(opts, 'light', 'Home')).toBe('dark')
    expect(optionForKey(opts, 'dark', 'End')).toBe('system')
  })
  it('otras teclas o lista vacía: null', () => {
    expect(optionForKey(opts, 'dark', 'Enter')).toBeNull()
    expect(optionForKey([] as string[], 'x', 'ArrowRight')).toBeNull()
  })
})
