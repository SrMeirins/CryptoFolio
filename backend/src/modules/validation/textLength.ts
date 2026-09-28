/**
 * Límites de longitud para campos de texto libre escritos por el usuario o
 * derivados de datos importados sin whitelist (nombres de wallet, notas de
 * transacción, redes/URLs personalizadas, nombre de activo...).
 *
 * Defensa en profundidad adicional a la sanitización de CSV Formula
 * Injection del export del frontend (ver frontend/src/utils/csvSafety.ts):
 * un límite de tamaño razonable frena también abusos de almacenamiento y
 * payloads desmedidos, independientemente del hallazgo de CSV.
 *
 * 500 caracteres para campos de texto libre largo tipo "notes" (comentarios
 * del usuario sobre una transacción o wallet) y 100 para identificadores
 * cortos tipo "name"/"custom_network" (nombres de wallet, red, activo) —
 * ambos con margen amplio sobre el uso real esperado.
 */
export const MAX_LENGTH_LONG = 500;
export const MAX_LENGTH_SHORT = 100;

/**
 * true si `value` es un string y supera `max` caracteres. Valores no-string
 * (undefined/null/otros tipos) nunca "exceden" aquí — la validación de
 * presencia y tipo es responsabilidad de cada endpoint, esta función solo
 * cubre el límite de longitud.
 */
export function exceedsMaxLength(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}
