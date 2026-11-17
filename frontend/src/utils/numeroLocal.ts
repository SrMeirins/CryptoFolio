// Números en los campos del simulador de venta (#529), en formato español:
// se escriben con coma o punto decimal y, al salir del campo, se muestran
// como 1.234,56. Funciones puras.

/**
 * Lee un número escrito a mano. Acepta «1.234,56», «1234,56», «1234.56» y
 * «1,5». Con coma, los puntos son separadores de miles; sin coma, un único
 * punto es el decimal salvo que agrupe miles («1.234.567»). Null si no es un
 * número válido.
 */
export function parseNumeroLocal(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (s === '' || !/^[+-]?[\d.,]+$/.test(s)) return null
  let normal: string
  if (s.includes(',')) {
    if ((s.match(/,/g) ?? []).length > 1) return null
    const [ent, dec] = s.split(',')
    if (ent.includes('.') && !/^[+-]?\d{1,3}(\.\d{3})+$/.test(ent)) return null
    normal = `${ent.replace(/\./g, '')}.${dec}`
  } else {
    const puntos = (s.match(/\./g) ?? []).length
    if (puntos > 1) {
      if (!/^[+-]?\d{1,3}(\.\d{3})+$/.test(s)) return null
      normal = s.replace(/\./g, '')
    } else normal = s
  }
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** Número con formato español, entre `minDecimals` y `maxDecimals` decimales (sin ceros sobrantes por encima del mínimo). */
export function formatNumeroLocal(n: number, maxDecimals = 8, minDecimals = 0): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: Math.min(minDecimals, maxDecimals), maximumFractionDigits: maxDecimals, useGrouping: true }).format(n)
}

/** Decimales con sentido para un precio: más cuanto menor es. */
export function decimalesPrecio(p: number): number {
  const a = Math.abs(p)
  return a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8
}
