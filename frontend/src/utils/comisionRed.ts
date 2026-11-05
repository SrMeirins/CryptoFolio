// Criterio de la comisión de red en traspasos a wallets propias (#532).
// Espejo de COMISION_RED_KEY y COMISION_RED_CRITERIOS de backend/src/modules/fifo/constants.ts.

export const COMISION_RED_KEY = 'fifo_comision_red_traspaso'
export type ComisionRedCriterio = 'transmision' | 'coste'

/** Criterio guardado; cualquier otro valor o su ausencia es el de por defecto. */
export function comisionRedCriterio(config: Record<string, string> | undefined): ComisionRedCriterio {
  return config?.[COMISION_RED_KEY] === 'coste' ? 'coste' : 'transmision'
}

/** Texto del diálogo de confirmación: qué cambia y qué ejercicios declarados pueden verse afectados. */
export function mensajeCambioComisionRed(next: ComisionRedCriterio, ejerciciosDeclarados: readonly number[]): string {
  const que = next === 'coste'
    ? 'Las comisiones de red de tus traspasos dejarán de dar ganancia o pérdida y su coste pasará a las unidades que llegan.'
    : 'Las comisiones de red de tus traspasos volverán a contar como transmisión, con su ganancia o pérdida.'
  const declarados = ejerciciosDeclarados.length === 0
    ? ''
    : ` Tienes ${ejerciciosDeclarados.length === 1 ? 'declarado el ejercicio' : 'declarados los ejercicios'} ${ejerciciosDeclarados.join(', ')}: sus cifras declaradas se conservan y Fiscal mostrará si las actuales difieren.`
  return `${que} Se recalculará el FIFO.${declarados}`
}
