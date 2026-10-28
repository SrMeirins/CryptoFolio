// Datos de la app para Acerca de y las copias (#444).

/** Versión de la build, la misma de package.json y de la release. */
export const APP_VERSION: string = __APP_VERSION__

/** Nombre del fichero de copia: cryptofolio-backup-AAAA-MM-DD.json (en UTC). */
export function backupFilename(now: Date = new Date()): string {
  return `cryptofolio-backup-${now.toISOString().slice(0, 10)}.json`
}
