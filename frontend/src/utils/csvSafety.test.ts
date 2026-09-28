import { describe, expect, it } from 'vitest'
import { sanitizeCsvField } from './csvSafety'

// Mismo comportamiento que backend/src/modules/csv/csvSafety.ts, duplicado
// aquí porque frontend y backend son proyectos TypeScript separados sin
// código compartido — ver backend/src/modules/csv/csvSafety.test.ts para el
// razonamiento completo de cada caso.
describe('sanitizeCsvField — mitigación de CSV Formula Injection (OWASP)', () => {
  it('antepone comilla simple a valores que empiezan por =', () => {
    expect(sanitizeCsvField('=cmd|\'/c calc\'!A0')).toBe('\'=cmd|\'/c calc\'!A0')
  })

  it('antepone comilla simple a valores que empiezan por +', () => {
    expect(sanitizeCsvField('+1+1')).toBe('\'+1+1')
  })

  it('antepone comilla simple a valores que empiezan por -', () => {
    expect(sanitizeCsvField('-2+3')).toBe('\'-2+3')
  })

  it('antepone comilla simple a valores que empiezan por @', () => {
    expect(sanitizeCsvField('@SUM(A1:A2)')).toBe('\'@SUM(A1:A2)')
  })

  it('antepone comilla simple a valores que empiezan por tabulador', () => {
    expect(sanitizeCsvField('\t=1+1')).toBe('\'\t=1+1')
  })

  it('antepone comilla simple a valores que empiezan por retorno de carro y los envuelve (el \\r también rompe RFC 4180)', () => {
    expect(sanitizeCsvField('\r=1+1')).toBe('"\'\r=1+1"')
  })

  it('no toca un símbolo de activo normal', () => {
    expect(sanitizeCsvField('BTC')).toBe('BTC')
  })

  it('envuelve entre comillas dobles un valor con el delimitador ;', () => {
    expect(sanitizeCsvField('XRP;extra')).toBe('"XRP;extra"')
  })

  it('escapa comillas dobles internas (RFC 4180) y envuelve el valor', () => {
    expect(sanitizeCsvField('Activo "raro"')).toBe('"Activo ""raro"""')
  })

  it('envuelve un valor con salto de línea', () => {
    expect(sanitizeCsvField('linea1\nlinea2')).toBe('"linea1\nlinea2"')
  })

  it('combina ambas protecciones: fórmula + delimitador en el mismo valor', () => {
    expect(sanitizeCsvField('=1+1;otra_col')).toBe('"\'=1+1;otra_col"')
  })
})
