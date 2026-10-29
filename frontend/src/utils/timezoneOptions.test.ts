import { describe, expect, it } from 'vitest'
import { allTimezones, timezoneOptions } from './timezoneOptions'

describe('timezoneOptions (#390)', () => {
  const all = ['America/New_York', 'Atlantic/Canary', 'Europe/Madrid', 'Asia/Tokyo', 'UTC']

  it('sugiere Madrid, Canarias y la del sistema arriba, y después el resto en orden', () => {
    const opts = timezoneOptions(all, 'Asia/Tokyo')
    expect(opts.filter(o => o.group === 'Sugeridas').map(o => o.value)).toEqual(['Europe/Madrid', 'Atlantic/Canary', 'Asia/Tokyo'])
    expect(opts.filter(o => o.group === 'Todas las zonas').map(o => o.value)).toEqual(['America/New_York', 'UTC'])
    expect(opts.find(o => o.value === 'Asia/Tokyo')?.description).toBe('Asia/Tokyo · la del sistema')
    expect(opts.find(o => o.value === 'Atlantic/Canary')?.label).toBe('Canarias')
  });

  it('sin repetir si el sistema ya es una sugerida, y sin una zona desconocida del sistema', () => {
    expect(timezoneOptions(all, 'Europe/Madrid').filter(o => o.value === 'Europe/Madrid')).toHaveLength(1)
    expect(timezoneOptions(all, 'Marte/Olimpo').some(o => o.value === 'Marte/Olimpo')).toBe(false)
  })

  it('la lista completa incluye las zonas IANA y UTC', () => {
    const list = allTimezones()
    expect(list).toContain('Europe/Madrid')
    expect(list).toContain('Atlantic/Canary')
    expect(list).toContain('UTC')
  })
})
