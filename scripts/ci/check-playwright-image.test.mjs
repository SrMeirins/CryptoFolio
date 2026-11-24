import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comprobar, versionesDeImagen, versionDelPaquete } from './check-playwright-image.mjs'

// Comprobación de versión del smoke del navegador (#602).
const wf = v => `jobs:\n  smoke:\n    container:\n      image: mcr.microsoft.com/playwright:v${v}-noble\n`
const pkg = v => ({ devDependencies: { '@playwright/test': v } })

test('misma versión: correcto', () => {
  const r = comprobar(wf('1.63.0'), pkg('1.63.0'))
  assert.equal(r.ok, true)
  assert.match(r.mensaje, /1\.63\.0/)
})

test('versiones distintas: falla con las dos en el mensaje', () => {
  const r = comprobar(wf('1.62.0'), pkg('1.63.0'))
  assert.equal(r.ok, false)
  assert.match(r.mensaje, /v1\.62\.0/)
  assert.match(r.mensaje, /1\.63\.0/)
})

test('sin imagen con versión exacta, falla', () => {
  assert.equal(comprobar('image: mcr.microsoft.com/playwright:latest', pkg('1.63.0')).ok, false)
  assert.equal(comprobar('', pkg('1.63.0')).ok, false)
})

test('@playwright/test sin versión exacta, falla', () => {
  assert.equal(versionDelPaquete(pkg('^1.63.0')), null)
  assert.equal(comprobar(wf('1.63.0'), pkg('^1.63.0')).ok, false)
  assert.equal(comprobar(wf('1.63.0'), {}).ok, false)
})

test('varias imágenes: todas deben coincidir', () => {
  assert.deepEqual(versionesDeImagen(wf('1.63.0') + wf('1.63.0')), ['1.63.0'])
  assert.equal(comprobar(wf('1.63.0') + wf('1.61.1'), pkg('1.63.0')).ok, false)
})
