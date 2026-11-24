#!/usr/bin/env node
// Comprobación de versión del smoke del navegador (#602): la etiqueta de la
// imagen oficial de Playwright del CI debe coincidir con la versión de
// @playwright/test del frontend. Si Dependabot sube una sin la otra, el CI
// falla aquí con un mensaje claro en lugar de fallar al lanzar Chromium.
// Uso (desde la raíz del repositorio): node scripts/ci/check-playwright-image.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const IMAGEN = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z]+/g

/** Versiones de las imágenes de Playwright citadas en el workflow, sin repetir. */
export function versionesDeImagen(workflow) {
  return [...new Set([...String(workflow).matchAll(IMAGEN)].map(m => m[1]))]
}

/** Versión exacta de @playwright/test; null si falta o no es exacta. */
export function versionDelPaquete(pkg) {
  const v = pkg?.devDependencies?.['@playwright/test'] ?? pkg?.dependencies?.['@playwright/test']
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null
}

/** Resultado de la comprobación con su mensaje. */
export function comprobar(workflow, pkg) {
  const imagenes = versionesDeImagen(workflow)
  const paquete = versionDelPaquete(pkg)
  if (imagenes.length === 0) return { ok: false, mensaje: 'El workflow no usa la imagen mcr.microsoft.com/playwright:v<versión>-<distribución> con versión exacta.' }
  if (!paquete) return { ok: false, mensaje: '@playwright/test no tiene una versión exacta en frontend/package.json.' }
  const distintas = imagenes.filter(v => v !== paquete)
  if (distintas.length > 0) {
    return { ok: false, mensaje: `La imagen de Playwright del CI (v${distintas.join(', v')}) no coincide con @playwright/test ${paquete}. Actualiza las dos a la misma versión.` }
  }
  return { ok: true, mensaje: `Imagen de Playwright y @playwright/test en la misma versión (${paquete}).` }
}

function main() {
  const raiz = fileURLToPath(new URL('../../', import.meta.url))
  const workflow = readFileSync(`${raiz}.github/workflows/ci.yml`, 'utf8')
  const pkg = JSON.parse(readFileSync(`${raiz}frontend/package.json`, 'utf8'))
  const { ok, mensaje } = comprobar(workflow, pkg)
  if (!ok) {
    console.error(mensaje)
    process.exit(1)
  }
  console.log(mensaje)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
