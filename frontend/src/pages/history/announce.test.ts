import { describe, expect, it } from 'vitest'
import { resultAnnouncement } from './announce'

const base = { loading: false, total: 34, filtered: true, page: 1, totalPages: 1, sort: { key: 'valor', dir: 'desc' } as const }

describe('resultAnnouncement (#351)', () => {
  it('anuncia recuento, página y orden', () => {
    expect(resultAnnouncement(base)).toBe('34 transacciones filtradas, página 1 de 1, ordenadas por valor descendente')
  })

  it('singular, sin filtros y orden ascendente', () => {
    expect(resultAnnouncement({ ...base, total: 1, filtered: false, sort: { key: 'fecha', dir: 'asc' } }))
      .toBe('1 transacción, página 1 de 1, ordenadas por fecha ascendente')
  })

  it('carga y resultados vacíos', () => {
    expect(resultAnnouncement({ ...base, loading: true })).toBe('Cargando…')
    expect(resultAnnouncement({ ...base, total: 0 })).toBe('Sin resultados para estos filtros')
    expect(resultAnnouncement({ ...base, total: 0, filtered: false })).toBe('Sin transacciones importadas')
  })
})
