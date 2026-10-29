import { z } from 'zod';
import { Response } from 'express';

// Errores de validación comunes (#385): una sola implementación.
import { sendZodError } from '../../modules/validation/zodErrors';
export { zodErrorMessage, sendZodError } from '../../modules/validation/zodErrors';

// Formato válido para un símbolo de activo: 1-20 caracteres alfanuméricos
const SYMBOL_RE = /^[A-Z0-9]{1,20}$/;
export function validateSymbol(raw: string): string | null {
  const s = raw.toUpperCase().trim();
  return SYMBOL_RE.test(s) ? s : null;
}

// coingecko_id real (ej. "bitcoin", "usd-coin"): minúsculas, números y
// guiones. Antes duplicado como regex suelta en /coingecko/test y
// /assets/:symbol/coingecko-id.
export const coingeckoIdSchema = z.string().regex(/^[a-z0-9-]{1,80}$/, 'coingecko_id inválido');

// POST /bulk-set-costs y DELETE /data/transactions, /price-cache son
// destructivos de alcance amplio — exigen { confirm: true } explícito en el
// body para evitar que una llamada accidental (bug de red, curl suelto, un
// futuro consumidor de la API) los dispare sin intención. El frontend ya
// pide confirmación al usuario (DatosSection.tsx) y envía este flag.
export const confirmBodySchema = z.object({
  confirm: z.literal(true, { error: 'Esta operación requiere { "confirm": true } en el body' }),
});

export function requireConfirm(res: Response, body: unknown): boolean {
  const result = confirmBodySchema.safeParse(body);
  if (!result.success) {
    sendZodError(res, result.error);
    return false;
  }
  return true;
}
