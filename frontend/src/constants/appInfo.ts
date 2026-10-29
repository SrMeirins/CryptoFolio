// Datos de la app para Acerca de y las copias (#444).

/** Versión de la build, la misma de package.json y de la release. */
export const APP_VERSION: string = __APP_VERSION__

/** Novedades de esta versión (sección del CHANGELOG), o vacío si no se incluyeron (#447). */
export const APP_CHANGELOG: string = __APP_CHANGELOG__

/** Repositorio público y documentos enlazados desde Acerca de (#447). */
export const REPO_URL = 'https://github.com/SrMeirins/CryptoFolio'
export const REPO_LINKS = [
  { label: 'Repositorio', href: REPO_URL },
  { label: 'Novedades completas', href: `${REPO_URL}/blob/main/CHANGELOG.md` },
  { label: 'Licencia', href: `${REPO_URL}/blob/main/LICENSE` },
  { label: 'Seguridad', href: `${REPO_URL}/blob/main/SECURITY.md` },
] as const

/** Nombre del fichero de copia: cryptofolio-backup-AAAA-MM-DD.json (en UTC). */
export function backupFilename(now: Date = new Date()): string {
  return `cryptofolio-backup-${now.toISOString().slice(0, 10)}.json`
}
