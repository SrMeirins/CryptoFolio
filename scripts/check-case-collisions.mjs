#!/usr/bin/env node
// Comprueba que no haya dos ficheros del repositorio cuyas rutas solo se
// distingan por mayúsculas (versión 1.0). En Windows y macOS el sistema de
// ficheros no las distingue: git conserva solo uno de los dos y un import
// resuelve al fichero equivocado. Se compara también sin la extensión de
// código, porque `import './Linea'` alcanza igual a Linea.tsx y a linea.ts.
// Uso: node scripts/check-case-collisions.mjs (lee `git ls-files`).
// Sale con código 1 y lista las colisiones si encuentra alguna.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Extensiones que un import de TypeScript o JavaScript puede omitir.
const EXTENSION_CODIGO = /(\.test)?\.(tsx?|mts|cts|jsx?|mjs|cjs)$/

/** Grupos de rutas distintas que coinciden al ignorar mayúsculas. */
export function colisiones(rutas) {
  const grupos = new Map()
  for (const ruta of rutas) {
    for (const clave of new Set([ruta, ruta.replace(EXTENSION_CODIGO, '')])) {
      const k = clave.toLowerCase()
      const grupo = grupos.get(k) ?? new Map()
      grupo.set(clave, ruta)
      grupos.set(k, grupo)
    }
  }
  const vistos = new Set()
  const res = []
  for (const grupo of grupos.values()) {
    if (grupo.size < 2) continue
    const rutasGrupo = [...new Set(grupo.values())].sort()
    const id = rutasGrupo.join('\n')
    if (rutasGrupo.length < 2 || vistos.has(id)) continue
    vistos.add(id)
    res.push(rutasGrupo)
  }
  return res
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rutas = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const encontradas = colisiones(rutas)
  if (encontradas.length > 0) {
    console.error('Ficheros que solo se distinguen por mayúsculas (fallan en Windows y macOS):')
    for (const g of encontradas) console.error(`  ${g.join('  y  ')}`)
    process.exit(1)
  }
  console.log(`Sin colisiones de mayúsculas en ${rutas.length} ficheros.`)
}
