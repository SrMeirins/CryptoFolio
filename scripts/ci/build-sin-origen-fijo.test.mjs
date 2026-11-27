// El frontend empaquetado (Electron) no debe compilarse con un origen fijo del
// backend (versión 1.0): el backend de escritorio usa un puerto dinámico (#56),
// así que un VITE_WS_URL o VITE_API_URL con host y puerto deja la app sin
// precio en vivo (la CSP además lo bloquea). El frontend usa su propio origen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DIR = path.join(import.meta.dirname, '..', '..', '.github', 'workflows')

test('ningún workflow fija VITE_WS_URL ni VITE_API_URL', () => {
  for (const f of readdirSync(DIR).filter(n => /\.ya?ml$/.test(n))) {
    const yml = readFileSync(path.join(DIR, f), 'utf8')
    assert.doesNotMatch(yml, /^\s*VITE_(WS|API)_URL\s*:/m, `${f} fija el origen del backend`)
  }
})
