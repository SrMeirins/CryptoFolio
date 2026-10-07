import { z, ZodError } from 'zod';
import { Response } from 'express';
import { MAX_LENGTH_LONG, MAX_LENGTH_SHORT } from '../../modules/validation/textLength';

// Construye un mensaje 400 legible en castellano a partir de los issues de
// Zod, sin filtrar detalles internos sensibles (solo nombres de campo y
// mensajes de validación) — mismo patrón que transactions.ts.
export function zodErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

export function sendZodError(res: Response, error: ZodError): void {
  res.status(400).json({ error: `Datos inválidos: ${zodErrorMessage(error)}` });
}

// wallet_kind (schema.sql): único enum real que la BD acepta en wallets.type.
export const WALLET_KINDS = ['exchange', 'hardware', 'software', 'bank'] as const;

export const shortText = (field: string) =>
  z.string().max(MAX_LENGTH_SHORT, `${field} no puede superar ${MAX_LENGTH_SHORT} caracteres`);
export const longText = (field: string) =>
  z.string().max(MAX_LENGTH_LONG, `${field} no puede superar ${MAX_LENGTH_LONG} caracteres`);

export const walletIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const walletAddressParamsSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
  addressId: z.string().uuid('addressId debe ser un UUID válido'),
});

export const walletSyncParamsSchema = z.object({
  walletId: z.string().uuid('walletId debe ser un UUID válido'),
  addressId: z.string().uuid('addressId debe ser un UUID válido'),
});

export const networkIdParamSchema = z.object({
  networkId: z.string().uuid('networkId debe ser un UUID válido'),
});
