import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { readProgressStream } from '../pages/import/importStream'

// Re-ejecutar el FIFO desde Datos con progreso (#454): lee el stream de
// POST /api/fifo/run/stream y guarda el avance y el resumen antes y después.

export interface FifoSummary { lots: number; openLots: number; consumptions: number; shortfalls: number; netGainEur: number }

export type FifoStreamEvent =
  | { phase: 'precios' }
  | { phase: 'fifo'; done: number; total: number }
  | { phase: 'done'; before: FifoSummary; after: FifoSummary; diff: FifoSummary; errors: number; warnings: number }
  | { phase: 'error'; message: string }

export type FifoRunState =
  | { status: 'idle' }
  | { status: 'running'; step: 'precios' | 'fifo'; done: number; total: number }
  | { status: 'done'; before: FifoSummary; after: FifoSummary; diff: FifoSummary; errors: number; warnings: number }
  | { status: 'error'; message: string }

/** Siguiente estado a partir de un evento del stream (puro, para testearlo). */
export function nextFifoState(state: FifoRunState, e: FifoStreamEvent): FifoRunState {
  switch (e.phase) {
    case 'precios': return { status: 'running', step: 'precios', done: 0, total: 0 }
    case 'fifo': return { status: 'running', step: 'fifo', done: e.done, total: e.total }
    case 'done': return { status: 'done', before: e.before, after: e.after, diff: e.diff, errors: e.errors, warnings: e.warnings }
    case 'error': return { status: 'error', message: e.message }
    default: return state
  }
}

export function useRunFifoStream() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<FifoRunState>({ status: 'idle' })

  async function run() {
    setState({ status: 'running', step: 'precios', done: 0, total: 0 })
    try {
      const res = await fetch('/api/fifo/run/stream', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const terminal = await readProgressStream<FifoStreamEvent>(res, e => setState(s => nextFifoState(s, e)))
      if (!terminal) setState({ status: 'error', message: 'Se perdió la conexión antes de terminar.' })
    } catch {
      setState({ status: 'error', message: 'No se pudo recalcular el FIFO' })
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      await queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
    }
  }

  return { state, run, running: state.status === 'running' }
}
