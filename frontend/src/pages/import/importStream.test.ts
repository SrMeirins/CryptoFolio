import { describe, expect, it } from 'vitest'
import { readProgressStream } from './importStream'
import type { ProgressEvent } from './types'

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream)
}

describe('readProgressStream', () => {
  it('invoca onEvent por cada línea "data: " válida', async () => {
    const res = sseResponse([
      'data: {"phase":"importing","message":"Leyendo CSV"}\n',
      'data: {"phase":"prices","message":"Calculando precios","progress":1,"total":2}\n',
    ])
    const events: ProgressEvent[] = []
    const sawTerminal = await readProgressStream(res, e => events.push(e))

    expect(events).toEqual([
      { phase: 'importing', message: 'Leyendo CSV' },
      { phase: 'prices', message: 'Calculando precios', progress: 1, total: 2 },
    ])
    expect(sawTerminal).toBe(false)
  })

  it('ignora líneas con JSON malformado sin interrumpir el stream', async () => {
    const res = sseResponse([
      'data: {"phase":"importing","message":"ok"}\n',
      'data: {esto no es json\n',
      'data: {"phase":"fifo","message":"ok2"}\n',
    ])
    const events: ProgressEvent[] = []
    await readProgressStream(res, e => events.push(e))

    expect(events).toEqual([
      { phase: 'importing', message: 'ok' },
      { phase: 'fifo', message: 'ok2' },
    ])
  })

  it('devuelve true al ver la fase terminal "done"', async () => {
    const res = sseResponse(['data: {"phase":"done","message":"Completado"}\n'])
    const sawTerminal = await readProgressStream(res, () => {})
    expect(sawTerminal).toBe(true)
  })

  it('devuelve true al ver la fase terminal "error"', async () => {
    const res = sseResponse(['data: {"phase":"error","message":"Fallo"}\n'])
    const sawTerminal = await readProgressStream(res, () => {})
    expect(sawTerminal).toBe(true)
  })

  it('devuelve false si el stream se cierra sin fase terminal (conexión perdida)', async () => {
    const res = sseResponse(['data: {"phase":"prices","message":"a medias"}\n'])
    const sawTerminal = await readProgressStream(res, () => {})
    expect(sawTerminal).toBe(false)
  })

  it('reconstruye eventos repartidos en varios chunks del stream', async () => {
    const res = sseResponse([
      'data: {"phase":"importing"',
      ',"message":"partido en dos"}\n',
    ])
    const events: ProgressEvent[] = []
    await readProgressStream(res, e => events.push(e))
    expect(events).toEqual([{ phase: 'importing', message: 'partido en dos' }])
  })
})
