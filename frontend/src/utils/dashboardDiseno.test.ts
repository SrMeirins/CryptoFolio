import { describe, expect, it } from 'vitest'
import {
  alternar, anuncioMovimiento, bloquesMinimapa, completarOrden, desplazamientoFila, estadoPanel, fijarEstado, destinoArrastre, DISENO_DEFECTO, esPorDefecto, filasDashboard, leerDiseno, mover, moverA, PANELES, serializarDiseno, type Diseno,
} from './dashboardDiseno'

// Lógica de orden del Dashboard personalizable (#521).

describe('leerDiseno', () => {
  it('sin clave o con JSON roto, el diseño por defecto', () => {
    expect(leerDiseno(undefined)).toBe(DISENO_DEFECTO)
    expect(leerDiseno({ dashboard_diseno: '{roto' })).toBe(DISENO_DEFECTO)
    expect(leerDiseno({ dashboard_diseno: 'null' })).toBe(DISENO_DEFECTO)
  })

  it('descarta desconocidos y repetidos y completa el orden', () => {
    const d = leerDiseno({ dashboard_diseno: JSON.stringify({ orden: ['fiscal', 'otro', 'fiscal', 'metas'], ocultos: ['ingresos', 'x'], contraidos: ['evolucion', 'evolucion'] }) })
    expect(d.orden).toHaveLength(PANELES.length)
    // Se respeta el orden guardado; los que faltan van tras su anterior por defecto.
    // Resumen (#522) no tiene anterior por defecto: va el primero.
    expect(d.orden.slice(0, 3)).toEqual(['resumen', 'fiscal', 'actividad'])
    expect(d.orden.indexOf('fiscal')).toBeLessThan(d.orden.indexOf('metas'))
    expect(d.ocultos).toEqual(['ingresos'])
    expect(d.contraidos).toEqual(['evolucion'])
  })

  it('la lectura de lo serializado devuelve lo mismo', () => {
    const d: Diseno = { orden: moverA(PANELES, 0, 8), ocultos: ['fiscal'], contraidos: ['metas'] }
    expect(leerDiseno({ dashboard_diseno: serializarDiseno(d) })).toEqual(d)
  })
})

describe('completarOrden', () => {
  it('un diseño guardado antes del resumen (#522) lo recibe el primero', () => {
    const antiguo = PANELES.filter(p => p !== 'resumen')
    expect(completarOrden(antiguo)).toEqual([...PANELES])
  })

  it('coloca el que falta tras el que lo precede por defecto', () => {
    const sinRendimiento = PANELES.filter(p => p !== 'rendimiento')
    expect(completarOrden(sinRendimiento)).toEqual([...PANELES])
    expect(completarOrden(['ingresos', 'evolucion'])).toEqual(['resumen', 'metas', 'variacion', 'ingresos', 'evolucion', 'rendimiento', 'pnl-diario', 'distribucion', 'fiscal', 'actividad'])
  })
})

describe('mover y moverA', () => {
  it('sube, baja y se queda en los extremos', () => {
    expect(mover(PANELES, 'variacion', -1).slice(1, 3)).toEqual(['variacion', 'metas'])
    expect(mover(PANELES, 'resumen', -1)).toEqual([...PANELES])
    expect(mover(PANELES, 'ingresos', 1)).toEqual([...PANELES])
    expect(mover(PANELES, 'metas', 1).slice(1, 3)).toEqual(['variacion', 'metas'])
  })

  it('lleva a cualquier posición acotada y no muta', () => {
    const orden = [...PANELES]
    expect(moverA(orden, 0, 99).at(-1)).toBe('resumen')
    expect(moverA(orden, PANELES.length - 1, -5)[0]).toBe('ingresos')
    expect(orden).toEqual([...PANELES])
  })
})

describe('alternar y esPorDefecto', () => {
  it('añade o quita sin repetir', () => {
    expect(alternar([], 'fiscal', true)).toEqual(['fiscal'])
    expect(alternar(['fiscal'], 'fiscal', true)).toEqual(['fiscal'])
    expect(alternar(['fiscal', 'metas'], 'fiscal', false)).toEqual(['metas'])
  })

  it('reconoce el diseño por defecto', () => {
    expect(esPorDefecto(DISENO_DEFECTO)).toBe(true)
    expect(esPorDefecto({ ...DISENO_DEFECTO, ocultos: ['fiscal'] })).toBe(false)
  })
})

describe('filasDashboard', () => {
  it('por defecto, Distribución y Fiscal comparten fila', () => {
    const filas = filasDashboard(DISENO_DEFECTO)
    expect(filas).toHaveLength(PANELES.length - 1)
    expect(filas).toContainEqual({ tipo: 'pareja', ids: ['distribucion', 'fiscal'] })
  })

  it('separados, contraído uno u oculto otro, cada uno a ancho completo', () => {
    const separados = filasDashboard({ ...DISENO_DEFECTO, orden: moverA(PANELES, 6, 0) })
    expect(separados.every(f => f.tipo === 'uno')).toBe(true)
    expect(filasDashboard({ ...DISENO_DEFECTO, contraidos: ['fiscal'] }).every(f => f.tipo === 'uno')).toBe(true)
    const sinFiscal = filasDashboard({ ...DISENO_DEFECTO, ocultos: ['fiscal'] })
    expect(sinFiscal).toHaveLength(PANELES.length - 1)
    expect(sinFiscal).not.toContainEqual({ tipo: 'uno', id: 'fiscal' })
  })

  it('juntos en orden inverso también comparten fila', () => {
    const inverso = filasDashboard({ ...DISENO_DEFECTO, orden: mover(PANELES, 'fiscal', -1) })
    expect(inverso).toContainEqual({ tipo: 'pareja', ids: ['fiscal', 'distribucion'] })
  })

  it('ocultar un panel entre los dos los junta', () => {
    const orden = moverA(PANELES, PANELES.indexOf('actividad'), PANELES.indexOf('fiscal'))
    expect(filasDashboard({ ...DISENO_DEFECTO, orden }).some(f => f.tipo === 'pareja')).toBe(false)
    expect(filasDashboard({ ...DISENO_DEFECTO, orden, ocultos: ['actividad'] }).some(f => f.tipo === 'pareja')).toBe(true)
  })
})

describe('destinoArrastre y anuncio', () => {
  it('cuenta los centros de las demás filas por encima del puntero', () => {
    const centros = [10, 30, 50, 70]
    expect(destinoArrastre(centros, 0, 5)).toBe(0)
    expect(destinoArrastre(centros, 0, 55)).toBe(2)
    expect(destinoArrastre(centros, 3, 35)).toBe(2)
    expect(destinoArrastre(centros, 1, 100)).toBe(3)
  })

  it('anuncia la posición', () => {
    expect(anuncioMovimiento('Evolución', 2, 9)).toBe('Evolución, posición 2 de 9')
  })
})

describe('estado de tres valores', () => {
  it('lee y fija completo, solo título y oculto, excluyentes', () => {
    expect(estadoPanel(DISENO_DEFECTO, 'fiscal')).toBe('completo')
    const titulo = fijarEstado(DISENO_DEFECTO, 'fiscal', 'titulo')
    expect(estadoPanel(titulo, 'fiscal')).toBe('titulo')
    const oculto = fijarEstado(titulo, 'fiscal', 'oculto')
    expect(oculto.contraidos).toEqual([])
    expect(oculto.ocultos).toEqual(['fiscal'])
    expect(estadoPanel(fijarEstado(oculto, 'fiscal', 'completo'), 'fiscal')).toBe('completo')
  })
})

describe('bloquesMinimapa', () => {
  it('por defecto, la pareja comparte fila en 2/3 y 1/3 y no se solapan', () => {
    const { bloques, total } = bloquesMinimapa(DISENO_DEFECTO)
    expect(bloques).toHaveLength(PANELES.length)
    const dist = bloques.find(b => b.id === 'distribucion')!
    const fis = bloques.find(b => b.id === 'fiscal')!
    expect(dist.y).toBe(fis.y)
    expect(dist.ancho).toBeCloseTo(2 / 3, 9)
    expect(fis.x).toBeCloseTo(2 / 3, 9)
    const filas = bloques.filter(b => b.x === 0).sort((a, b) => a.y - b.y)
    for (let i = 1; i < filas.length; i++) expect(filas[i].y).toBeGreaterThanOrEqual(filas[i - 1].y + filas[i - 1].alto)
    expect(total).toBeGreaterThan(0)
  })

  it('oculto no aparece y solo título es una franja', () => {
    const d = fijarEstado(fijarEstado(DISENO_DEFECTO, 'ingresos', 'oculto'), 'evolucion', 'titulo')
    const { bloques } = bloquesMinimapa(d)
    expect(bloques.some(b => b.id === 'ingresos')).toBe(false)
    const evo = bloques.find(b => b.id === 'evolucion')!
    expect(evo.estado).toBe('titulo')
    expect(evo.alto).toBeLessThan(2)
  })
})

describe('desplazamientoFila', () => {
  it('las filas entre origen y destino se apartan el alto de la arrastrada', () => {
    // Arrastrar la 0 a la 2: la 1 y la 2 suben.
    expect([0, 1, 2, 3].map(i => desplazamientoFila(i, 0, 2, 50))).toEqual([0, -50, -50, 0])
    // Arrastrar la 3 a la 1: la 1 y la 2 bajan.
    expect([0, 1, 2, 3].map(i => desplazamientoFila(i, 3, 1, 50))).toEqual([0, 50, 50, 0])
    expect([0, 1].map(i => desplazamientoFila(i, 1, 1, 50))).toEqual([0, 0])
  })
})
