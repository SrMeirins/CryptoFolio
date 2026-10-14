// Respaldo de los logos (#201): iniciales con un color estable derivado del
// símbolo, para que cada activo sin logo se distinga y conserve siempre el mismo.

/** Hasta 2 caracteres alfanuméricos del símbolo, en mayúsculas. */
export function assetInitials(symbol: string): string {
  return symbol.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'
}

/** Tono (0-359) estable para un símbolo: el mismo símbolo da siempre el mismo color. */
export function assetHue(symbol: string): number {
  let hash = 0
  for (const ch of symbol.toUpperCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}
