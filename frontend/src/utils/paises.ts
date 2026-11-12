// Nombres de países por su código ISO 3166-1 alfa-2 (#545), con la API del
// navegador; sin ella, el propio código.

const regiones = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }) } catch { return null } })()

export function nombrePais(codigo: string): string {
  if (!/^[A-Z]{2}$/.test(codigo)) return codigo
  try { return regiones?.of(codigo) ?? codigo } catch { return codigo }
}

/**
 * Países donde suelen estar las entidades custodias de los exchanges, fuera de
 * España (UE, Espacio Económico Europeo y otras sedes habituales), para elegir
 * por nombre. Ordenados por su nombre en castellano.
 */
const CODIGOS_EXTRANJERO = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'GB', 'CH', 'LI', 'NO', 'IS', 'US', 'CA', 'KY', 'BS', 'BM', 'VG', 'SC', 'SG', 'HK',
  'AE', 'JP', 'KR', 'AU',
] as const

export const PAISES_EXTRANJERO: readonly { codigo: string; nombre: string }[] =
  CODIGOS_EXTRANJERO.map(codigo => ({ codigo, nombre: nombrePais(codigo) })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
