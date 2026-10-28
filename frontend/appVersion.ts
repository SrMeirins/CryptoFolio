import { existsSync, readFileSync } from 'node:fs'

// Versión de la app desde package.json (#444) y su sección del CHANGELOG
// (#447), compartidas por vite.config y vitest.config: Acerca de y las pruebas
// ven lo mismo.
export const APP_VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

/**
 * Sección «## [versión]» del CHANGELOG.md de la raíz del repositorio, sin su
 * cabecera; vacía si el fichero no está (p. ej. en el contenedor de desarrollo,
 * que solo monta el frontend).
 */
export function changelogSection(markdown: string, version: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex(l => l.startsWith(`## [${version}]`))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => l.startsWith('## ['))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

const CHANGELOG = new URL('../CHANGELOG.md', import.meta.url)
const APP_CHANGELOG = existsSync(CHANGELOG) ? changelogSection(readFileSync(CHANGELOG, 'utf8'), APP_VERSION) : ''

/** `define` de Vite que inyecta __APP_VERSION__ y __APP_CHANGELOG__ en el código. */
export const appVersionDefine = {
  __APP_VERSION__: JSON.stringify(APP_VERSION),
  __APP_CHANGELOG__: JSON.stringify(APP_CHANGELOG),
}
