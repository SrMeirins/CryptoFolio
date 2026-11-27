import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearFragmento, componerSeccion, insertarEnChangelog } from './juntar.mjs'

test('parsearFragmento acepta varias subsecciones', () => {
  const m = parsearFragmento('554.md', '### Añadido\n\n- Uno (#554).\n- Dos (#554).\n\n### Corregido\n\n- Tres (#554).\n')
  assert.deepEqual([...m.keys()], ['Añadido', 'Corregido'])
  assert.deepEqual(m.get('Añadido'), ['- Uno (#554).', '- Dos (#554).'])
  assert.deepEqual(m.get('Corregido'), ['- Tres (#554).'])
})

test('parsearFragmento rechaza una subsección desconocida y nombra el fichero', () => {
  assert.throws(() => parsearFragmento('554.md', '### Mejorado\n\n- Algo.\n'), /554\.md/)
})

test('parsearFragmento rechaza una subsección vacía', () => {
  assert.throws(() => parsearFragmento('554.md', '### Añadido\n\n### Corregido\n\n- Algo.\n'), /554\.md/)
})

test('parsearFragmento rechaza texto fuera de las viñetas y fragmentos sin subsección', () => {
  assert.throws(() => parsearFragmento('554.md', '### Añadido\n\nTexto suelto.\n'), /554\.md/)
  assert.throws(() => parsearFragmento('554.md', '- Viñeta sin subsección.\n'), /554\.md/)
  assert.throws(() => parsearFragmento('554.md', ''), /554\.md/)
})

test('componerSeccion ordena subsecciones y viñetas', () => {
  const seccion = componerSeccion([
    { nombre: '560.md', contenido: '### Corregido\n\n- Del 560.\n' },
    { nombre: '554.md', contenido: '### Corregido\n\n- Del 554.\n\n### Añadido\n\n- Nuevo 554.\n' },
  ], '1.1.0', '2026-12-01')
  assert.equal(
    seccion,
    '## [1.1.0] - 2026-12-01\n\n### Añadido\n\n- Nuevo 554.\n\n### Corregido\n\n- Del 554.\n- Del 560.\n',
  )
})

test('componerSeccion falla sin fragmentos', () => {
  assert.throws(() => componerSeccion([], '1.1.0', '2026-12-01'))
})

const BASE = [
  '# Changelog', '', '## [Unreleased]', '', '## [1.0.0] - 2026-11-26', '', '### Añadido', '', '- Todo.', '',
  '[Unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD',
  '[1.0.0]: https://github.com/o/r/compare/v0.0.14...v1.0.0', '',
].join('\n')

test('insertarEnChangelog coloca la sección y actualiza los enlaces', () => {
  const seccion = '## [1.1.0] - 2026-12-01\n\n### Añadido\n\n- Nuevo.\n'
  const r = insertarEnChangelog(BASE, seccion, '1.1.0', '1.0.0')
  assert.ok(r.indexOf('## [Unreleased]') < r.indexOf('## [1.1.0]'))
  assert.ok(r.indexOf('## [1.1.0]') < r.indexOf('## [1.0.0]'))
  assert.match(r, /^\[Unreleased\]: https:\/\/github\.com\/o\/r\/compare\/v1\.1\.0\.\.\.HEAD$/m)
  assert.match(r, /^\[1\.1\.0\]: https:\/\/github\.com\/o\/r\/compare\/v1\.0\.0\.\.\.v1\.1\.0$/m)
  assert.ok(r.indexOf('[Unreleased]:') < r.indexOf('[1.1.0]:'))
  assert.ok(r.indexOf('[1.1.0]:') < r.indexOf('[1.0.0]:'))
})

test('insertarEnChangelog falla si la versión ya existe', () => {
  assert.throws(() => insertarEnChangelog(BASE, '## [1.0.0] - 2026-12-01\n', '1.0.0', '0.0.14'), /1\.0\.0/)
})
