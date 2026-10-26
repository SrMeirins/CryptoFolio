
// Errores de validación comunes (#385): una sola implementación.
export { zodErrorMessage, sendZodError } from '../../modules/validation/zodErrors';

export function parseYear(raw: string): number | null {
  // Exactamente 4 dígitos (#295): parseInt aceptaba «2024abc» o «2024.5».
  if (!/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  if (y < 2009 || y > 2100) return null; // Bitcoin nació en 2009
  return y;
}
