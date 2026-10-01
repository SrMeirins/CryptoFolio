import { portfolioApi } from '../../api/portfolio'
import type { ProgressEvent } from './types'

// Comprueba si una importación quedó registrada pese a haberse perdido el stream.
// El backend inserta la fila en csv_imports dentro de la misma transacción que las
// transacciones, así que verla aparecer (con un count mayor) confirma el commit.
export async function waitForImportCommit(prevCount: number, attempts = 8, delayMs = 3000): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    try {
      const list = await portfolioApi.getImports()
      if (list.length > prevCount) return true
    } catch { /* reintenta */ }
  }
  return false
}

/**
 * Lee el stream SSE de POST /api/imports/confirm, línea a línea, invocando
 * `onEvent` por cada evento válido. Devuelve `true` si se vio una fase
 * terminal ('done' o 'error') antes de que el stream se cerrara.
 */
export async function readProgressStream(res: Response, onEvent: (event: ProgressEvent) => void): Promise<boolean> {
  let sawTerminal = false
  const reader  = res.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) return sawTerminal

  // Buffer entre lecturas: un evento SSE puede llegar partido entre dos
  // chunks del stream, así que solo procesamos líneas completas (con '\n')
  // y conservamos el resto para completarlo en la siguiente lectura.
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event: ProgressEvent = JSON.parse(line.slice(6))
        onEvent(event)
        if (event.phase === 'done' || event.phase === 'error') sawTerminal = true
      } catch { /* ignorar línea malformada */ }
    }
  }
  return sawTerminal
}
