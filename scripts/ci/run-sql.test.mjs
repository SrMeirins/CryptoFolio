import { test } from 'node:test'
import assert from 'node:assert/strict'
import { argumentos } from './run-sql.mjs'

// Argumentos del ejecutor de SQL del smoke (#602), con valores sintéticos.
const URL_FALSA = 'postgresql://usuario@host-falso:5432/base'

test('fichero .sql y DATABASE_URL: correcto', () => {
  assert.deepEqual(argumentos(['node', 'run-sql.mjs', 'seed.sql'], { DATABASE_URL: URL_FALSA }), { fichero: 'seed.sql', url: URL_FALSA })
})

test('sin fichero o sin extensión .sql: error de uso', () => {
  assert.match(argumentos(['node', 'run-sql.mjs'], { DATABASE_URL: URL_FALSA }).error, /^Uso:/)
  assert.match(argumentos(['node', 'run-sql.mjs', 'seed.txt'], { DATABASE_URL: URL_FALSA }).error, /^Uso:/)
})

test('sin DATABASE_URL: error', () => {
  assert.match(argumentos(['node', 'run-sql.mjs', 'seed.sql'], {}).error, /DATABASE_URL/)
})
