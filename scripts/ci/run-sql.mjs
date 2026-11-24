#!/usr/bin/env node
// Ejecuta un fichero SQL contra DATABASE_URL con el paquete pg del backend
// (#602): la imagen de Playwright del smoke no trae psql y no se instala nada
// con apt. Todo el fichero va en una sola consulta, en una transacción
// implícita: ante el primer error se detiene y no deja nada a medias (como
// psql con ON_ERROR_STOP y --single-transaction).
// Uso: DATABASE_URL=... node scripts/ci/run-sql.mjs ruta/al/fichero.sql
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Valida los argumentos: un fichero .sql y la URL de la base de datos. */
export function argumentos(argv, env) {
  const fichero = argv[2]
  if (!fichero || !fichero.endsWith('.sql')) return { error: 'Uso: node scripts/ci/run-sql.mjs <fichero.sql>' }
  if (!env.DATABASE_URL) return { error: 'Falta la variable DATABASE_URL.' }
  return { fichero, url: env.DATABASE_URL }
}

async function main() {
  const args = argumentos(process.argv, process.env)
  if (args.error) {
    console.error(args.error)
    process.exit(1)
  }
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  const { Client } = require('pg')
  const client = new Client({ connectionString: args.url, connectionTimeoutMillis: 15_000, statement_timeout: 120_000 })
  await client.connect()
  try {
    await client.query(readFileSync(args.fichero, 'utf8'))
    console.log(`SQL aplicado: ${args.fichero}`)
  } finally {
    await client.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    // Solo el mensaje: la URL de conexión no se imprime.
    console.error(`Error al aplicar el SQL: ${err.message}`)
    process.exit(1)
  })
}
