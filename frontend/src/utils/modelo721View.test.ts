import { describe, expect, it } from 'vitest'
import { autocustodiaEur, buildModelo721Csv, escalaBarra, escalaRedonda, liveModelo721, margenUmbral, repartoEntidades, textoMargen, textoVeredicto } from './modelo721View'
import type { Grupo721, Modelo721, Veredicto721 } from '../pages/fiscal/types'

// Modelo 721 por entidad (#545). Datos sintéticos.
const entidad = { nombre: 'Exchange Sintético Ltd', nif: 'MT000', pais: 'MT', web: 'https://ejemplo.test' }
const grupo = (p: Partial<Grupo721>): Grupo721 => ({
  clave: 'entidad:e1', entidad, enEspana: false, wallets: [{ id: 'w1', nombre: 'Spot', origen: 'automatico', desde: null, filaId: null, regla: null }, { id: 'w2', nombre: 'Margen', origen: 'automatico', desde: null, filaId: null, regla: null }], computa: true,
  activos: [{ asset: 'AAA', unidades: 2, valorEur: 40_000, sinPrecio: false }], totalEur: 40_000, ...p,
})
const veredicto = (p: Partial<Veredicto721> = {}): Veredicto721 => ({
  obligado: false, motivo: 'no_supera', valorEur: 40_000, umbral: 50_000, objetivoIncremento: null, extinguidas: [], ...p,
})
const datos = (p: Partial<Modelo721> = {}): Modelo721 => ({
  year: 2026, esAnioEnCurso: true, fecha: '2026-11-12', grupos: [grupo({})], veredicto: veredicto(), historico: [],
  totalValor: 55_000, totalValorCustodia: 40_000, superaUmbral: false, umbral: 50_000, sinCustodia: [], reglas: [],
  preciosPendientes: [], incompleto: false, ...p,
})

describe('textoVeredicto', () => {
  it('umbral, incremento y extinción explican por qué obliga', () => {
    expect(textoVeredicto(veredicto({ obligado: true, motivo: 'umbral', valorEur: 60_000 }), false)).toMatchObject({ titulo: 'Tienes que presentarlo', tono: 'obligado' })
    expect(textoVeredicto(veredicto({ obligado: true, motivo: 'incremento' }), false).motivo).toMatch(/más de 20\.000 €/)
    const e = textoVeredicto(veredicto({ obligado: true, motivo: 'extincion', extinguidas: [{ entidad: 'X Ltd', asset: 'BBB' }] }), false)
    expect(e.motivo).toMatch(/BBB en X Ltd/)
    expect(textoVeredicto(veredicto({ obligado: true, motivo: 'umbral' }), true).titulo).toMatch(/ya está presentado/)
  })
  it('no obliga, con el objetivo si ya se presentó; sin precios, dudoso', () => {
    expect(textoVeredicto(veredicto(), false)).toMatchObject({ titulo: 'No tienes que presentarlo', tono: 'libre' })
    expect(textoVeredicto(veredicto({ motivo: 'incremento_insuficiente', objetivoIncremento: 80_000 }), false).motivo).toMatch(/80\.000/)
    expect(textoVeredicto(veredicto({ obligado: null }), false).tono).toBe('dudoso')
  })
})

describe('escalaBarra, margen y autocustodia', () => {
  it('la escala cubre el valor, el umbral y el objetivo con margen', () => {
    const e = escalaBarra({ valorEur: 40_000, umbral: 50_000, objetivoIncremento: 80_000 })
    expect(e.max).toBeCloseTo(88_000, 6)
    expect(e.pct(80_000)).toBeCloseTo(90.909, 2)
    expect(e.pct(200_000)).toBe(100)
  })
  it('margen hasta el umbral y valor en autocustodia', () => {
    expect(margenUmbral(datos())).toBe(10_000)
    expect(autocustodiaEur(datos())).toBe(15_000)
  })
})

describe('buildModelo721Csv', () => {
  it('una fila por entidad y activo, con los datos de la entidad y si computa', () => {
    const csv = buildModelo721Csv(datos({ grupos: [grupo({}), grupo({ clave: 'wallet:w9', entidad: null, wallets: [{ id: 'w9', nombre: 'Otra', origen: 'desconocido', desde: null, filaId: null, regla: null }], computa: true })] }))
    const [cab, a, b] = csv.split('\n')
    expect(cab).toBe('Fecha de valoración;Entidad;NIF;País;Web;Wallets;Activo;Unidades;Valor (EUR);Computa;Sin precio')
    expect(a).toBe('2026-11-12;Exchange Sintético Ltd;MT000;MT;https://ejemplo.test;Spot, Margen;AAA;2;40000.00;sí;')
    expect(b).toMatch(/^2026-11-12;Sin entidad asignada;;;;Otra;AAA/)
  })
})

describe('liveModelo721', () => {
  it('año en curso: revalora con el precio en vivo y rehace el veredicto', () => {
    const d = liveModelo721(datos(), { AAA: 30_000 })
    expect(d.totalValorCustodia).toBe(60_000)
    expect(d.veredicto).toMatchObject({ obligado: true, motivo: 'umbral', valorEur: 60_000 })
    expect(d.totalValor).toBe(75_000)
  })
  it('con presentación previa, solo obliga por encima del objetivo; la extinción se mantiene', () => {
    const conObjetivo = datos({ veredicto: veredicto({ objetivoIncremento: 80_000 }) })
    expect(liveModelo721(conObjetivo, { AAA: 30_000 }).veredicto).toMatchObject({ obligado: false, motivo: 'incremento_insuficiente' })
    const ext = datos({ veredicto: veredicto({ extinguidas: [{ entidad: 'X', asset: 'BBB' }] }) })
    expect(liveModelo721(ext, { AAA: 1 }).veredicto).toMatchObject({ obligado: true, motivo: 'extincion' })
  })
  it('años cerrados no se tocan', () => {
    const cerrado = datos({ esAnioEnCurso: false })
    expect(liveModelo721(cerrado, { AAA: 30_000 })).toBe(cerrado)
  })
})

describe('escalaRedonda', () => {
  it('divisiones redondas que cubren el máximo y el umbral', () => {
    expect(escalaRedonda(30_000, 50_000)).toEqual({ top: 60_000, ticks: [0, 20_000, 40_000, 60_000] })
    expect(escalaRedonda(130_000, 50_000)).toEqual({ top: 150_000, ticks: [0, 50_000, 100_000, 150_000] })
    expect(escalaRedonda(0, 50_000).ticks.at(-1)).toBeGreaterThanOrEqual(50_000)
  })
  it('nunca más de 6 divisiones', () => {
    for (const m of [1, 999, 12_345, 77_777, 1_234_567]) expect(escalaRedonda(m, 50_000).ticks.length).toBeLessThanOrEqual(6)
  })
})

describe('textoMargen', () => {
  it('por debajo, lo que falta; por encima, cuánto lo supera', () => {
    expect(textoMargen(veredicto({ valorEur: 40_000 }))).toMatch(/^Te faltan 10\.000,00\s€ para el umbral$/)
    expect(textoMargen(veredicto({ valorEur: 65_000 }))).toMatch(/^Superas el umbral en 15\.000,00\s€$/)
  })
  it('ya presentado y por encima del umbral: lo que falta para volver a obligar', () => {
    expect(textoMargen(veredicto({ valorEur: 70_000, objetivoIncremento: 80_000 }))).toMatch(/^Te faltan 10\.000,00\s€ para volver a estar obligado$/)
  })
})

describe('repartoEntidades', () => {
  it('solo los grupos que computan, de mayor a menor, con su porcentaje', () => {
    const r = repartoEntidades([
      grupo({ totalEur: 10_000 }),
      grupo({ clave: 'entidad:e2', entidad: { ...entidad, nombre: 'Española', pais: 'ES' }, enEspana: true, computa: false, totalEur: 99_000 }),
      grupo({ clave: 'wallet:w9', entidad: null, wallets: [{ id: 'w9', nombre: 'Otra', origen: 'desconocido', desde: null, filaId: null, regla: null }], totalEur: 30_000 }),
    ])
    expect(r.map(x => [x.nombre, x.pct])).toEqual([['Otra', 75], ['Exchange Sintético Ltd', 25]])
  })
})
