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

// URL de explorador (#471): solo http y https, que son las que abren el
// navegador. Las de red son plantillas con {address} o {tx_hash}, así que se
// comprueban con un valor de ejemplo en su lugar.
const EXPLORER_SCHEMES = new Set(['http:', 'https:']);
export function isExplorerUrl(raw: string): boolean {
  try {
    const url = new URL(raw.replace(/\{(address|tx_hash)\}/g, 'x'));
    return EXPLORER_SCHEMES.has(url.protocol) && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}
export const explorerUrl = (field: string) =>
  longText(field).refine(isExplorerUrl, `${field} debe ser una URL http o https`);

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
