import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FiscalHero } from './FiscalHero'
import { TRAMOS_DEFAULT } from '../../utils/tramosIrpf'
import type { CarryforwardDetalle, FiscalSummary } from './types'

// Bloque «Neto a declarar» con la cascada de la cuota (#537). Datos sintéticos.
const summary: FiscalSummary = {
  year: 2025, esAnioEnCurso: false, totalGanancias: 300, totalPerdidas: -120, netoPatrimonial: 180,
  numOperacionesPatrimoniales: 8, totalRendimientos: 15, numRendimientos: 4, totalBaseGeneral: 0, numBaseGeneral: 0, valorTotal31Dic: 1000,
  superaUmbral721: false, umbral721: 50000, preciosPendientes: [], valorIncompleto: false,
}
const cf: CarryforwardDetalle = {
  year: 2025, netoAntes: 180, rendimientos: 15, perdida: 0, compensadoPatrim: 100, compensadoRend: 3.75,
  compensadoRendAnio: 0, compensado: 103.75, limiteRend25: 3.75, netoDespues: 80,
}
const render = (p: Partial<Parameters<typeof FiscalHero>[0]> = {}) =>
  renderToStaticMarkup(<FiscalHero summary={summary} cuota={17.48} tipoMedio={19} comparison={null} tramos={TRAMOS_DEFAULT} hoy="2025-11-09" {...p} />)

describe('FiscalHero, cascada de la cuota (#537)', () => {
  it('la cascada lleva de las ganancias a la base y termina en la cuota', () => {
    const html = render({ cf })
    expect(html).toContain('De dónde sale la cuota')
    const filas = [...html.matchAll(/<th scope="row"[^>]*>(.*?)<\/th>/g)].map(m => m[1].replace(/<[^>]+>/g, ''))
    expect(filas.map(f => f.replace(/(Pérdidas pendientes|Escala del ahorro|Staking e|Como máximo|Sin base).*$/, ''))).toEqual([
      'Ganancias', 'Pérdidas', 'Neto patrimonial', 'Pérdidas anteriores compensadas con ganancias', 'Rendimientos del capital mobiliario',
      'Pérdidas anteriores compensadas con rendimientos', 'Base del ahorro', 'Cuota estimada',
    ])
    // 180 - 100 + 15 - 3,75 = 91,25 €
    expect(html).toMatch(/91,25\s€/)
    // Los movimientos van sin signo en la cifra: lo dicen el operador y el texto para lector de pantalla.
    expect(html).toMatch(/<span class="sr-only">resta <\/span>100,00\s€/)
    expect(html).toContain('Como máximo el 25 % de los rendimientos (art. 49 LIRPF)')
  })

  it('sin compensación: sin filas de compensación', () => {
    const html = render()
    expect(html).not.toContain('compensadas')
    expect(html).toMatch(/195,00\s€/)
  })

  it('año en curso: avance «Día N de 365»; cerrado: plazo de la Renta', () => {
    const enCurso = render({ summary: { ...summary, year: 2025, esAnioEnCurso: true } })
    expect(enCurso).toContain('role="progressbar"')
    expect(enCurso).toContain('Día 313 de 365')
    const cerrado = render()
    expect(cerrado).not.toContain('role="progressbar"')
    expect(cerrado).toContain('Ejercicio cerrado · Plazo de la Renta cerrado')
    expect(render({ declarada: true })).toContain('Ejercicio cerrado · Renta declarada')
  })

  it('el cálculo por tramos se despliega desde un botón que anuncia su estado', () => {
    const html = render({ cf })
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Ver el cálculo por tramos/)
    expect(render({ summary: { ...summary, totalGanancias: 0, totalPerdidas: -50, netoPatrimonial: -50, totalRendimientos: 0 } }))
      .not.toContain('Ver el cálculo por tramos')
  })

  it('la cuota es neutra: sin color de aviso', () => {
    expect(render({ cf })).not.toContain('text-warning')
  })

  it('el color acompaña al operador: suma en verde, resta en rojo; la cuota cierra en el pie', () => {
    const html = render({ cf })
    expect(html).toMatch(/text-positive-ink[^>]*>\+<\/span>/)
    expect(html).toMatch(/text-negative-ink[^>]*>-<\/span>/)
    expect(html).toMatch(/<tfoot>.*Cuota estimada.*<\/tfoot>/s)
  })

  it('pérdida del año: fila de la compensación con el 25 % de sus rendimientos (fase 1)', () => {
    const enPerdidas = { ...summary, totalGanancias: 0, totalPerdidas: -100, netoPatrimonial: -100, totalRendimientos: 40 }
    const d: CarryforwardDetalle = { year: 2025, netoAntes: -100, rendimientos: 40, perdida: 100, compensadoPatrim: 0, compensadoRend: 10,
      compensadoRendAnio: 10, compensado: 10, limiteRend25: 10, netoDespues: 0 }
    const html = render({ summary: enPerdidas, cf: d, cuota: 5.7 })
    expect(html).toContain('Pérdida del año compensada con rendimientos')
    expect(html).toMatch(/el resto, 90,00\s€, pasa a los 4 ejercicios siguientes/)
    expect(html).toMatch(/Base del ahorro.*?30,00\s€/s)
  })

  it('las rentas de la base general se informan aparte, fuera de la cuota', () => {
    expect(render()).not.toContain('Fuera de esta cuota')
    const html = render({ summary: { ...summary, totalBaseGeneral: 12.5, numBaseGeneral: 3 } })
    expect(html).toMatch(/Fuera de esta cuota: <span class="mono">12,50\s€<\/span> en la base general/)
    expect(html).toContain('(3 operaciones)')
  })
})
