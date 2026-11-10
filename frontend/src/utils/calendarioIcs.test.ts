import { describe, expect, it } from 'vitest'
import { buildIcs, diaSiguiente, plazosParaCalendario, plegar } from './calendarioIcs'
import type { FiscalHito } from '../api/portfolio'

// «Añadir al calendario» (#538). Datos sintéticos.
const h = (p: Partial<FiscalHito>): FiscalHito => ({
  id: 'renta', ejercicio: 2026, titulo: 'Renta de 2026', desde: '2027-04-08', hasta: '2027-06-30', inicioAproximado: true,
  estado: 'proximo', diasRestantes: 232, diasParaAbrir: 149, progreso: 0, ...p,
})
const ahora = new Date('2026-11-10T09:30:00Z')

describe('plazosParaCalendario', () => {
  it('sin los pasados ni el 721 sin obligación', () => {
    const ciclo = [h({ estado: 'pasado', id: 'cierre' }), h({ id: 'modelo721', obligado: false }), h({ id: 'modelo721', ejercicio: 2027, obligado: null }), h({})]
    expect(plazosParaCalendario(ciclo).map(x => `${x.id}:${x.ejercicio}`)).toEqual(['modelo721:2027', 'renta:2026'])
  })
})

describe('buildIcs', () => {
  const ics = buildIcs([h({}), h({ id: 'cierre', ejercicio: 2026, titulo: 'Cierre del ejercicio 2026', desde: '2026-01-01', hasta: '2026-12-31', inicioAproximado: false })], ahora)
  const lineas = ics.split('\r\n')

  it('estructura RFC 5545: CRLF, cabecera y un VEVENT por plazo', () => {
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
    expect(lineas.slice(0, 2)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0'])
    expect(lineas.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(lineas.at(-2)).toBe('END:VCALENDAR')
  })

  it('evento de día completo en el último día del plazo, con fin exclusivo y en días de la zona de la app', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270630\r\nDTEND;VALUE=DATE:20270701')
    // Cambio de año: el 31 dic acaba el 1 ene siguiente.
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101')
    expect(ics).toContain('DTSTAMP:20261110T093000Z')
    expect(ics).toContain('UID:renta-2026@cryptofolio')
  })

  it('alarmas 30 y 7 días antes, como la campana', () => {
    expect(ics.match(/TRIGGER:-P30D/g)).toHaveLength(2)
    expect(ics.match(/TRIGGER:-P7D/g)).toHaveLength(2)
  })

  it('escapa comas y punto y coma, y ninguna línea pasa de 75 octetos', () => {
    expect(ics).toContain('SUMMARY:Último día: Renta de 2026')
    const desplegado = ics.replace(/\r\n /g, '')
    expect(desplegado).toContain('DESCRIPTION:Plazo: de principios de abril (hacia el 8 abr 2027) al 30 jun 2027. Fechas habituales: la AEAT publica cada año el calendario oficial. Aviso de CryptoFolio.')
    expect(desplegado).toContain('DESCRIPTION:Plazo: del 1 ene 2026 al 31 dic 2026.')
    expect(buildIcs([h({ titulo: 'A, b; c' })], ahora)).toContain('SUMMARY:Último día: A\\, b\\; c')
    const enc = new TextEncoder()
    for (const l of lineas) expect(enc.encode(l).length).toBeLessThanOrEqual(75)
  })
})

describe('plegar', () => {
  it('no corta un carácter de varios bytes', () => {
    const plegada = plegar('X'.repeat(74) + 'ñañañá')
    expect(plegada.split('\r\n ')[0]).toBe('X'.repeat(74))
    expect(plegada.replace(/\r\n /g, '')).toBe('X'.repeat(74) + 'ñañañá')
  })
})

describe('diaSiguiente', () => {
  it('cruza meses, años y bisiestos', () => {
    expect(diaSiguiente('2027-06-30')).toBe('2027-07-01')
    expect(diaSiguiente('2026-12-31')).toBe('2027-01-01')
    expect(diaSiguiente('2028-02-28')).toBe('2028-02-29')
  })
})
