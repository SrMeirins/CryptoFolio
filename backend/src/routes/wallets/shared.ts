import { z } from 'zod';
import { MAX_LENGTH_LONG, MAX_LENGTH_SHORT } from '../../modules/validation/textLength';

// Errores de validación comunes (#385): una sola implementación.
export { zodErrorMessage, sendZodError } from '../../modules/validation/zodErrors';

// wallet_kind (schema.sql): único enum real que la BD acepta en wallets.type.
export const WALLET_KINDS = ['exchange', 'hardware', 'software', 'bank'] as const;

export const shortText = (field: string) =>
  z.string().max(MAX_LENGTH_SHORT, `${field} no puede superar ${MAX_LENGTH_SHORT} caracteres`);
export const longText = (field: string) =>
  z.string().max(MAX_LENGTH_LONG, `${field} no puede superar ${MAX_LENGTH_LONG} caracteres`);

export const walletIdParamSchema = z.object({
  id: z.uuid('id debe ser un UUID válido'),
});

export const walletAddressParamsSchema = z.object({
  id: z.uuid('id debe ser un UUID válido'),
  addressId: z.uuid('addressId debe ser un UUID válido'),
});

export const walletSyncParamsSchema = z.object({
  walletId: z.uuid('walletId debe ser un UUID válido'),
  addressId: z.uuid('addressId debe ser un UUID válido'),
});

export const networkIdParamSchema = z.object({
  networkId: z.uuid('networkId debe ser un UUID válido'),
});
