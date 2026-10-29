// Validación de los ajustes numéricos de Fiscal (#445). Funciones puras: el
// valor se guarda al salir del campo o con Enter solo si es válido; si no, se
// muestra el motivo y se conserva el anterior.

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

/** Umbral del Modelo 721 en euros: entero entre 1 y 10.000.000. */
export function validateThreshold(raw: string): Validation<number> {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Introduce un importe entero en euros' }
  const value = Number(text)
  if (value < 1 || value > 10_000_000) return { ok: false, error: 'Entre 1 y 10.000.000 €' }
  return { ok: true, value }
}

/** Tipo de un tramo IRPF: mayor que 0 y hasta 100, con coma o punto decimal. */
export function validateRate(raw: string): Validation<number> {
  const text = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Introduce un porcentaje' }
  const value = Number(text)
  if (value <= 0 || value > 100) return { ok: false, error: 'Mayor que 0 y hasta 100' }
  return { ok: true, value }
}

/** Umbral de polvo en euros (#446): de 0 a 1.000, con coma o punto y hasta dos decimales. */
export function validateDust(raw: string): Validation<number> {
  const text = raw.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'Introduce un importe con hasta dos decimales' }
  const value = Number(text)
  if (value > 1000) return { ok: false, error: 'Hasta 1.000 €' }
  return { ok: true, value }
}
