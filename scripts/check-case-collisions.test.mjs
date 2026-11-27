import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colisiones } from './check-case-collisions.mjs'

test('detecta un .ts y un .tsx que solo cambian en la mayúscula', () => {
  assert.deepEqual(colisiones(['src/LineaTiempo.tsx', 'src/lineaTiempo.ts']), [['src/LineaTiempo.tsx', 'src/lineaTiempo.ts']])
})

test('detecta rutas idénticas salvo mayúsculas, también en carpetas', () => {
  assert.deepEqual(colisiones(['docs/Readme.md', 'docs/README.md']), [['docs/README.md', 'docs/Readme.md']])
  assert.equal(colisiones(['Src/a.ts', 'src/b.ts']).length, 0)
})

test('un componente y su test o su lógica con otro nombre no colisionan', () => {
  assert.deepEqual(colisiones([
    'src/LineaTiempo.tsx', 'src/lineaCombinada.ts', 'src/lineaCombinada.test.ts', 'src/a.ts', 'src/a.test.ts',
  ]), [])
})

test('un fichero que no es código conserva su extensión al comparar', () => {
  assert.deepEqual(colisiones(['docs/guia.md', 'docs/Guia.json']), [])
})
