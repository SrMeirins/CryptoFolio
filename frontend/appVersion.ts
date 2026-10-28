import { readFileSync } from 'node:fs'

// Versión de la app desde package.json (#444), compartida por vite.config y
// vitest.config: Acerca de y las pruebas ven la misma.
export const APP_VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

/** `define` de Vite que inyecta __APP_VERSION__ en el código. */
export const appVersionDefine = { __APP_VERSION__: JSON.stringify(APP_VERSION) }
