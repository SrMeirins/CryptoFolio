#!/usr/bin/env node
// Carga la cartera de demostración en un backend (versión 1.0): descarga los
// cierres diarios públicos en EUR de Binance (sin clave; no se envía nada del
// usuario), genera con ellos el CSV sintético de scripts/demo/cartera.mjs, lo
// importa y lanza el FIFO. Pensado para el stack
// de `make demo`: se niega a cargar en un backend que ya tenga operaciones,
// para no mezclar nunca la demo con datos reales.
// Uso: node scripts/demo/cargar.mjs http://127.0.0.1:<puerto del backend demo>
import { generarCartera } from './cartera.mjs'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  console.error('Uso: node scripts/demo/cargar.mjs http://127.0.0.1:<puerto> (solo un backend local)')
  process.exit(1)
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${base}${ruta}`, { ...opciones, signal: AbortSignal.timeout(300_000) })
  const cuerpo = await res.text()
  if (!res.ok) throw new Error(`${opciones.method ?? 'GET'} ${ruta}: ${res.status} ${cuerpo.slice(0, 300)}`)
  return cuerpo ? JSON.parse(cuerpo) : null
}

const existentes = await pedir('/api/transactions?limit=1')
const total = existentes?.total ?? existentes?.transactions?.length ?? 0
if (total > 0) {
  console.error(`El backend ya tiene ${total} operaciones: la demo solo se carga en una base vacía (make demo-down y make demo).`)
  process.exit(1)
}

// Cierres diarios en EUR desde diciembre de 2022 (velas públicas de Binance,
// sin clave; la API gratuita de CoinGecko solo da un año de historia). Binance
// devuelve como mucho 1000 velas por petición: se piden por páginas.
const PARES = { BTC: 'BTCEUR', ETH: 'ETHEUR', SOL: 'SOLEUR', ADA: 'ADAEUR', XRP: 'XRPEUR', LINK: 'LINKEUR', DOT: 'DOTEUR' }
const DIA = 86_400_000
const precios = {}
for (const [activo, par] of Object.entries(PARES)) {
  precios[activo] = {}
  for (let desde = Date.UTC(2022, 11, 1); desde < Date.now();) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${par}&interval=1d&startTime=${desde}&limit=1000`
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Binance ${par}: ${res.status}`)
    const velas = await res.json()
    // Cada vela: [apertura (ms), apertura, máximo, mínimo, cierre, …]; se usa el cierre.
    for (const v of velas) precios[activo][new Date(v[0]).toISOString().slice(0, 10)] = Number(v[4])
    if (velas.length < 1000) break
    desde = velas.at(-1)[0] + DIA
  }
}
console.log('Cierres de mercado descargados para', Object.keys(precios).join(', '))

const csv = generarCartera({ precios })
const form = new FormData()
form.append('file', new Blob([csv], { type: 'text/csv' }), 'cartera-demo.csv')
form.append('exchange', 'binance')
const importacion = await pedir('/api/imports', { method: 'POST', body: form })
// Una fila que el importador no entiende se excluye y se informa en `errors`:
// la cartera de demostración debe entrar entera.
if (importacion?.errors?.length) {
  console.error(`La importación excluyó filas:\n${importacion.errors.join('\n')}`)
  process.exit(1)
}
const tras = await pedir('/api/transactions?limit=1')
console.log(`Importadas ${tras.total} operaciones de la cartera de demostración.`)
await pedir('/api/fifo/run', { method: 'POST' })
console.log('FIFO calculado. Los precios históricos se descargan en segundo plano.')
