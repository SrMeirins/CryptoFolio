import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVOS, generarCartera } from './cartera.mjs'

// Cartera de demostración (versión 1.0): sintética, coherente y determinista.
const filas = () => generarCartera().trim().split('\n').slice(1).map(l => l.split(','))

test('determinista: la misma semilla da el mismo CSV; otra, otro', () => {
  assert.equal(generarCartera(), generarCartera())
  assert.notEqual(generarCartera({ semilla: 1 }), generarCartera())
})

test('cabecera de Binance y solo operaciones que el importador admite', () => {
  assert.equal(generarCartera().split('\n')[0], 'User ID,Time,Account,Operation,Coin,Change,Remark')
  const admitidas = new Set(['Deposit', 'Fiat Withdraw', 'Transaction Spend', 'Transaction Buy', 'Transaction Fee', 'Transaction Sold', 'Transaction Revenue', 'Staking Rewards'])
  for (const f of filas()) assert.ok(admitidas.has(f[3]), f[3])
})

test('nada en el futuro respecto a noviembre de 2026 y en orden cronológico', () => {
  const fechas = filas().map(f => f[1])
  assert.ok(fechas.every(d => d < '26-11-01'))
  assert.deepEqual([...fechas].sort(), fechas)
})

test('ningún saldo de cripto queda en negativo', () => {
  const saldo = Object.fromEntries(Object.keys(ACTIVOS).map(k => [k, 0]))
  for (const [, , , , moneda, cambio] of filas()) {
    if (moneda in saldo) {
      saldo[moneda] += Number(cambio)
      assert.ok(saldo[moneda] > -1e-9, `${moneda} en negativo`)
    }
  }
})

test('con tabla de cierres, compra al precio de mercado de su día', () => {
  const precios = { BTC: { '2022-12-01': 50000 } }
  const csv = generarCartera({ precios })
  const lineas = csv.trim().split('\n').map(l => l.split(','))
  const i = lineas.findIndex(f => f[3] === 'Transaction Buy' && f[4] === 'BTC')
  const euros = -Number(lineas[i - 1][5]) // la fila de coste va justo antes
  const cantidad = Number(lineas[i][5])
  assert.ok(Math.abs(euros / cantidad - 50000) / 50000 < 0.01)
})

test('hay ventas y cada segundo vende un solo activo (el importador rechaza dos)', () => {
  const porSegundo = new Map()
  for (const [, t, , op, moneda] of filas()) {
    if (op !== 'Transaction Sold') continue
    porSegundo.set(t, new Set([...(porSegundo.get(t) ?? []), moneda]))
  }
  assert.ok(porSegundo.size > 0, 'sin ventas')
  for (const [t, activos] of porSegundo) assert.equal(activos.size, 1, `varios activos vendidos en ${t}`)
})
