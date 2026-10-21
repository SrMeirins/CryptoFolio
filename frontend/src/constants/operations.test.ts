import { describe, expect, it } from 'vitest'
import src from '../../../backend/src/modules/history/operationLabels.ts?raw'
import { OP_META } from './operations'

// El backend ordena por tipo con sus propias etiquetas (#349): deben ser
// exactamente las que ve el usuario.
describe('OP_META', () => {
  it('las etiquetas coinciden con OPERATION_LABELS del backend', () => {
    const body = src.match(/OPERATION_LABELS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? ''
    const backend = Object.fromEntries([...body.matchAll(/^\s*([A-Z_]+): '([^']+)',/gm)].map(m => [m[1], m[2]]))
    const frontend = Object.fromEntries(Object.entries(OP_META).map(([k, v]) => [k, v.label]))
    expect(Object.keys(backend).length).toBeGreaterThan(20)
    expect(frontend).toEqual(backend)
  })
})
