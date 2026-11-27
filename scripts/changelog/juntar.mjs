#!/usr/bin/env node
// Junta los fragmentos de `changelog.d/<N>.md` en una sección nueva de
// CHANGELOG.md al cerrar una release. Cada PR aporta su fragmento y así dos PR
// en paralelo no se pisan editando la misma sección.
// Uso: node scripts/changelog/juntar.mjs <version> <fecha>
// Escribe CHANGELOG.md e imprime los fragmentos consumidos, uno por línea, para
// el `git rm`. Si algo falla sale con código 1 sin escribir nada.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Subsecciones permitidas, en el orden de Keep a Changelog.
const SUBSECCIONES = ['Añadido', 'Cambiado', 'Obsoleto', 'Eliminado', 'Corregido', 'Seguridad']
const VERSION = /^\d+\.\d+\.\d+$/

/** Número de PR que encabeza el nombre del fragmento (`554.md` da 554). */
function numeroDe(nombre) {
  const n = Number.parseInt(nombre, 10)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

function validarVersion(version) {
  if (!VERSION.test(version)) throw new Error(`Versión no válida: "${version}" (se espera X.Y.Z)`)
}

/** De subsección a viñetas. Lanza un Error que nombra el fichero si el formato no es válido. */
export function parsearFragmento(nombre, contenido) {
  const res = new Map()
  let actual = null
  for (const linea of contenido.split('\n')) {
    if (linea.trim() === '') continue
    const cabecera = /^### (.+?)\s*$/.exec(linea)
    if (cabecera) {
      actual = cabecera[1]
      if (!SUBSECCIONES.includes(actual)) {
        throw new Error(`${nombre}: subsección desconocida "${actual}" (permitidas: ${SUBSECCIONES.join(', ')})`)
      }
      if (!res.has(actual)) res.set(actual, [])
    } else if (actual === null) {
      throw new Error(`${nombre}: el fragmento debe empezar por una subsección "### ..."`)
    } else if (linea.startsWith('- ')) {
      res.get(actual).push(linea)
    } else if (/^\s+\S/.test(linea) && res.get(actual).length > 0) {
      // Continuación indentada de la viñeta anterior.
      const v = res.get(actual)
      v[v.length - 1] += `\n${linea}`
    } else {
      throw new Error(`${nombre}: texto fuera de las viñetas en "${actual}": "${linea}"`)
    }
  }
  if (res.size === 0) throw new Error(`${nombre}: el fragmento no tiene ninguna subsección`)
  for (const [sub, vinetas] of res) {
    if (vinetas.length === 0) throw new Error(`${nombre}: la subsección "${sub}" está vacía`)
  }
  return res
}

/** Sección `## [X.Y.Z] - fecha` con las viñetas ordenadas por número de fragmento. */
export function componerSeccion(fragmentos, version, fecha) {
  validarVersion(version)
  if (fragmentos.length === 0) throw new Error('No hay fragmentos que juntar')
  const ordenados = [...fragmentos].sort((a, b) => numeroDe(a.nombre) - numeroDe(b.nombre))
  const parseados = ordenados.map((f) => parsearFragmento(f.nombre, f.contenido))
  const bloques = [`## [${version}] - ${fecha}`]
  for (const sub of SUBSECCIONES) {
    const vinetas = parseados.flatMap((m) => m.get(sub) ?? [])
    if (vinetas.length > 0) bloques.push(`### ${sub}\n\n${vinetas.join('\n')}`)
  }
  return `${bloques.join('\n\n')}\n`
}

/** Inserta la sección bajo Unreleased y actualiza los enlaces del pie. No muta la entrada. */
export function insertarEnChangelog(changelog, seccion, version, anterior) {
  validarVersion(version)
  validarVersion(anterior)
  if (changelog.includes(`## [${version}]`)) throw new Error(`La versión ${version} ya existe en CHANGELOG.md`)
  const cabecera = /^## \[Unreleased\][ \t]*\n+/m
  const enlace = /^\[Unreleased\]: (.+)\/compare\/.+$/m
  if (!cabecera.test(changelog)) throw new Error('CHANGELOG.md no tiene la sección "## [Unreleased]"')
  const m = enlace.exec(changelog)
  if (!m) throw new Error('CHANGELOG.md no tiene el enlace "[Unreleased]:" en el pie')
  const base = m[1]
  return changelog
    .replace(cabecera, () => `## [Unreleased]\n\n${seccion.trimEnd()}\n\n`)
    .replace(
      enlace,
      () => `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/compare/v${anterior}...v${version}`,
    )
}

/** Versión de la primera sección `## [x.y.z]` que sigue a Unreleased. */
function deducirAnterior(changelog) {
  const m = /^## \[Unreleased\][\s\S]*?^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)
  if (!m) throw new Error('No se encuentra la versión anterior bajo Unreleased')
  return m[1]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [version, fecha] = process.argv.slice(2)
    if (!version || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Uso: node scripts/changelog/juntar.mjs <version> <YYYY-MM-DD>')
    }
    const raiz = fileURLToPath(new URL('../../', import.meta.url))
    const carpeta = join(raiz, 'changelog.d')
    const nombres = readdirSync(carpeta).filter((n) => /^\d.*\.md$/.test(n))
    const fragmentos = nombres.map((nombre) => ({ nombre, contenido: readFileSync(join(carpeta, nombre), 'utf8') }))
    const ruta = join(raiz, 'CHANGELOG.md')
    const actual = readFileSync(ruta, 'utf8')
    const seccion = componerSeccion(fragmentos, version, fecha)
    const nuevo = insertarEnChangelog(actual, seccion, version, deducirAnterior(actual))
    writeFileSync(ruta, nuevo)
    for (const f of fragmentos) console.log(`changelog.d/${f.nombre}`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
