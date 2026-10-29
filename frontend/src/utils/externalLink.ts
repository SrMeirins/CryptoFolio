// Enlaces a exploradores y otras webs externas (#471): solo http y https, con
// host y sin credenciales. Un href con javascript:, file: u otro esquema no se
// pinta (React 18 solo avisa) y en la app de escritorio tampoco se abriría.

const SCHEMES = new Set(['http:', 'https:'])

export function isSafeLink(raw: string | null | undefined): raw is string {
  if (!raw) return false
  try {
    const url = new URL(raw)
    return SCHEMES.has(url.protocol) && url.hostname !== '' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/**
 * Enlace del explorador de una dirección: la plantilla de la red con el valor
 * codificado en su marcador o, si no lo lleva, la URL propia tal cual.
 */
export function explorerLink(url: string | null | undefined, marker: '{address}' | '{tx_hash}', value: string | null | undefined): string | null {
  if (!url || !value) return null
  const href = url.includes(marker) ? url.replace(marker, encodeURIComponent(value)) : url
  return isSafeLink(href) ? href : null
}
