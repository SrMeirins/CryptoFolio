#!/usr/bin/env node
// Auditoría de dependencias del CI (#384): como `npm audit --audit-level=high`,
// pero admite excepciones temporales documentadas en audit-exceptions.json
// (id del aviso, paquete, motivo, fecha de caducidad e issue). Falla con avisos
// altos o críticos no aceptados y con excepciones caducadas.
// Uso (en el directorio del paquete): node ../scripts/audit.mjs [--omit=dev]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BLOCKING = new Set(['high', 'critical'])

/** Id del aviso (GHSA-...) a partir de su URL. */
export function advisoryId(url) {
  const m = /(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i.exec(String(url ?? ''))
  return m ? m[1].toLowerCase() : null
}

/**
 * Evalúa un informe de `npm audit --json` (formato v2) con las excepciones.
 * `today` es AAAA-MM-DD. Devuelve los avisos que bloquean, los aceptados y
 * las excepciones caducadas.
 */
export function evaluate(report, exceptions, today) {
  const valid = new Map()
  const expired = []
  for (const e of exceptions) {
    if (e.caduca < today) expired.push(e)
    else valid.set(String(e.id).toLowerCase(), e)
  }
  const blocking = new Map()
  const accepted = new Map()
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue
      const id = advisoryId(via.url) ?? `${pkg}:${via.title}`
      const target = valid.has(id) ? accepted : blocking
      target.set(id, { id, paquete: pkg, severidad: via.severity, titulo: via.title })
    }
  }
  return { blocking: [...blocking.values()], accepted: [...accepted.values()], expired }
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const exceptions = JSON.parse(readFileSync(join(here, 'audit-exceptions.json'), 'utf8'))
  const args = ['audit', '--json', ...process.argv.slice(2).filter(a => a === '--omit=dev')]
  let out
  try {
    out = execFileSync('npm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (err) {
    // npm audit sale con código 1 si encuentra avisos: el JSON llega igual.
    out = err.stdout
    if (!out) throw err
  }
  const today = new Date().toISOString().slice(0, 10)
  const { blocking, accepted, expired } = evaluate(JSON.parse(out), exceptions, today)
  for (const a of accepted) console.log(`Aceptado temporalmente: ${a.id} (${a.paquete}, ${a.severidad}): ${a.titulo}`)
  for (const e of expired) console.error(`Excepción caducada el ${e.caduca}: ${e.id} (${e.paquete}). Corrígelo o renueva la excepción con motivo.`)
  for (const b of blocking) console.error(`Aviso ${b.severidad} sin corregir: ${b.id} (${b.paquete}): ${b.titulo}`)
  if (blocking.length > 0 || expired.length > 0) process.exit(1)
  console.log('Auditoría sin avisos altos ni críticos pendientes.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
