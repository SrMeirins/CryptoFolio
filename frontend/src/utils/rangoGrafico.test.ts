import { describe, expect, it } from 'vitest'
import { diasEntre, hoyApp, irAHoy, leerRango, resolverRango, restarMeses, saltarAnio, serializarRango, textoRango, type RangoValor } from './rangoGrafico'

// Rango común de los gráficos (#508). Zona de la app por defecto: Europe/Madrid.
const p = (preset: Extract<RangoValor, { tipo: 'preset' }>['preset']): RangoValor => ({ tipo: 'preset', preset })

describe('hoyApp: día en la zona de la aplicación', () => {
  it('cambio de hora y fin de año', () => {
    // 29 mar 2026: a las 01:00 UTC se adelanta la hora en Madrid.
    expect(hoyApp(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29')
    expect(hoyApp(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25')
    // Nochevieja: en UTC aún es 31 de diciembre, en Madrid ya es 1 de enero.
    expect(hoyApp(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })
})

describe('resolverRango', () => {
  const hoy = '2026-03-31'
  it('presets que terminan hoy, contando hoy', () => {
    expect(resolverRango(p('7d'), hoy)).toEqual({ intradia: false, from: '2026-03-25', to: hoy })
    expect(diasEntre(resolverRango(p('30d'), hoy).from!, hoy)).toBe(30)
    expect(resolverRango(p('24h'), hoy)).toEqual({ intradia: true, to: hoy })
    expect(resolverRango(p('todo'), hoy)).toEqual({ intradia: false, to: hoy })
  })
  it('meses de calendario sin desbordar el fin de mes', () => {
    expect(restarMeses('2026-03-31', 1)).toBe('2026-02-28')
    expect(restarMeses('2024-03-31', 1)).toBe('2024-02-29')
    expect(resolverRango(p('6m'), '2026-08-31').from).toBe('2026-03-01')
    expect(resolverRango(p('1a'), hoy).from).toBe('2025-04-01')
  })
  it('«Este año» desde el 1 de enero, también el día de Año Nuevo', () => {
    expect(resolverRango(p('anio'), '2027-01-01')).toEqual({ intradia: false, from: '2027-01-01', to: '2027-01-01' })
  })
  it('personalizado: se recorta a hoy y «Hasta hoy» rueda', () => {
    expect(resolverRango({ tipo: 'rango', from: '2026-01-01', to: '2026-12-31', hastaHoy: false }, hoy).to).toBe(hoy)
    expect(resolverRango({ tipo: 'rango', from: '2026-01-01', to: '2026-02-01', hastaHoy: true }, hoy).to).toBe(hoy)
  })
})

describe('saltos de año e «Ir a hoy»', () => {
  const hoy = '2026-06-15'
  it('año natural completo; el actual, hasta hoy; con límites', () => {
    expect(saltarAnio(p('30d'), hoy, -1, 2020)).toEqual({ tipo: 'rango', from: '2025-01-01', to: '2025-12-31', hastaHoy: false })
    const anterior = saltarAnio(p('30d'), hoy, -1, 2020)!
    expect(saltarAnio(anterior, hoy, 1, 2020)).toEqual({ tipo: 'rango', from: '2026-01-01', to: hoy, hastaHoy: true })
    expect(saltarAnio(p('todo'), hoy, 1, 2020)).toBeNull()
    expect(saltarAnio(anterior, hoy, -1, 2025)).toBeNull()
  })
  it('«Ir a hoy» conserva la duración y termina hoy; un preset no cambia', () => {
    const r = irAHoy({ tipo: 'rango', from: '2025-01-01', to: '2025-01-10', hastaHoy: false }, hoy)
    expect(r).toEqual({ tipo: 'rango', from: '2026-06-06', to: hoy, hastaHoy: true })
    expect(irAHoy(p('7d'), hoy)).toBeNull()
  })
})

describe('URL y textos', () => {
  const hoy = '2026-06-15'
  it('ida y vuelta; lo no válido o no permitido se ignora', () => {
    for (const v of [p('30d'), { tipo: 'rango', from: '2025-01-01', to: '2025-12-31', hastaHoy: false } as RangoValor]) {
      expect(leerRango(serializarRango(v), ['30d'], hoy)).toEqual(v)
    }
    expect(leerRango('2025-01-01_hoy', [], hoy)).toEqual({ tipo: 'rango', from: '2025-01-01', to: hoy, hastaHoy: true })
    for (const raw of ['24h', 'xx', '2025-13-01_2025-12-31', '2025-12-31_2025-01-01', '2030-01-01_hoy', '', null]) {
      expect(leerRango(raw, ['30d'], hoy)).toBeNull()
    }
  })
  it('texto legible del rango', () => {
    expect(textoRango(p('30d'), hoy)).toBe('Últimos 30 días')
    expect(textoRango({ tipo: 'rango', from: '2025-01-01', to: '2025-12-31', hastaHoy: false }, hoy)).toBe('Del 1 ene 2025 al 31 dic 2025')
    expect(textoRango({ tipo: 'rango', from: '2026-01-01', to: hoy, hastaHoy: true }, hoy)).toBe('Desde el 1 ene 2026 hasta hoy')
  })
})
