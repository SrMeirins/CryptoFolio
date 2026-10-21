#!/usr/bin/env node
// Comprueba que un package.json declara todas sus dependencias con versión
// exacta (#355): sin rangos ^, ~, >, <, *, x ni «latest». Uso:
//   node scripts/check-exact-versions.mjs <ruta/package.json> [...]
// Sale con código 1 y lista los infractores si encuentra alguno.
import { readFileSync } from 'node:fs'

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
// Versión SemVer exacta (con prerelease/build opcionales) o un protocolo explícito.
const EXACT = /^(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?|file:.+|workspace:\d.+)$/

export function rangedDependencies(pkg) {
  const out = []
  for (const section of SECTIONS) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      if (!EXACT.test(String(spec))) out.push(`${section}: ${name}@${spec}`)
    }
  }
  return out
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Uso: node scripts/check-exact-versions.mjs <package.json> [...]')
  process.exit(2)
}
let failed = false
for (const file of files) {
  const bad = rangedDependencies(JSON.parse(readFileSync(file, 'utf8')))
  if (bad.length > 0) {
    failed = true
    console.error(`${file}: ${bad.length} dependencias sin versión exacta`)
    for (const b of bad) console.error(`  - ${b}`)
  } else {
    console.log(`${file}: todas las dependencias con versión exacta`)
  }
}
process.exit(failed ? 1 : 0)
