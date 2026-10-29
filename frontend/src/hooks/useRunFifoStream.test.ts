import { describe, expect, it } from 'vitest'
import { nextFifoState, type FifoRunState } from './useRunFifoStream'

// Estados del FIFO con progreso (#454).
const sum = (lots: number) => ({ lots, openLots: 0, consumptions: 0, shortfalls: 0, netGainEur: 0 })

describe('nextFifoState', () => {
  it('pasa por precios, avance y resumen final', () => {
    let s: FifoRunState = { status: 'idle' }
    s = nextFifoState(s, { phase: 'precios' })
    expect(s).toEqual({ status: 'running', step: 'precios', done: 0, total: 0 })
    s = nextFifoState(s, { phase: 'fifo', done: 30, total: 120 })
    expect(s).toEqual({ status: 'running', step: 'fifo', done: 30, total: 120 })
    s = nextFifoState(s, { phase: 'done', before: sum(1), after: sum(3), diff: sum(2), errors: 0, warnings: 0 })
    expect(s).toMatchObject({ status: 'done', diff: { lots: 2 } })
  })

  it('un error deja el mensaje', () => {
    expect(nextFifoState({ status: 'idle' }, { phase: 'error', message: 'No se pudo recalcular el FIFO' }))
      .toEqual({ status: 'error', message: 'No se pudo recalcular el FIFO' })
  })
})
