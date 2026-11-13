import type { CustodiaWallet721, DatosEntidad721, OrigenCustodia, Regla721 } from '../pages/fiscal/types'

// Custodia del 721 en palabras (#545): dónde está y si computa, cómo se sabe,
// y las filas indicadas por el usuario agrupadas cuando se cambian varias
// wallets a la vez (las subcuentas de un exchange). Funciones puras.

/** Dónde está la custodia y si computa. */
export function textoEstado(enEspana: boolean | null): string {
  if (enEspana === true) return 'En España: no computa'
  if (enEspana === false) return 'Fuera de España: computa'
  return 'No se sabe: computa por prudencia'
}

/** Cómo se sabe: automático (con su exchange), indicado por el usuario o nada. */
export function textoOrigen(origen: OrigenCustodia, exchange: string | null): string {
  if (origen === 'automatico') return exchange ? `Automático, según las condiciones de ${exchange}` : 'Automático'
  if (origen === 'usuario') return 'Lo indicaste tú'
  return 'Sin indicar'
}

export const reglaDe = (reglas: readonly Regla721[], clave: string | null): Regla721 | null =>
  (clave ? reglas.find(r => r.clave === clave) ?? null : null)

export interface FilaAgrupada { ids: string[]; desde: string | null; enEspana: boolean; entidad: DatosEntidad721 | null; wallets: number }

/** Filas del usuario de varias wallets, unidas por fecha, ubicación y entidad (las iguales se quitan juntas). */
export function agruparFilas(wallets: readonly CustodiaWallet721[]): FilaAgrupada[] {
  const porClave = new Map<string, FilaAgrupada>()
  for (const w of wallets) {
    for (const f of w.filas) {
      const clave = `${f.desde ?? ''}|${f.enEspana}|${f.entidad?.nombre ?? ''}`
      const g = porClave.get(clave)
      if (g) { g.ids.push(f.id); g.wallets += 1 }
      else porClave.set(clave, { ids: [f.id], desde: f.desde, enEspana: f.enEspana, entidad: f.entidad, wallets: 1 })
    }
  }
  return [...porClave.values()].sort((a, b) => (a.desde ?? '').localeCompare(b.desde ?? ''))
}
