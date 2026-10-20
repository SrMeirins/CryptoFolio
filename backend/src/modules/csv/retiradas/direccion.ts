// Direcciones de destino de los retiros (#320). Módulo puro: sin BD.

/**
 * Lista blanca de caracteres de una dirección on-chain: cubre los formatos de
 * las redes soportadas (base58, bech32, hex con 0x, cuentas de Hedera «0.0.N»)
 * y descarta cualquier otro contenido del CSV antes de guardarlo o mostrarlo.
 */
export const DIRECCION_RE = /^[A-Za-z0-9._:-]{4,128}$/;
/** Hash de transacción on-chain: hex (con o sin 0x) o base58 (Solana). */
const TX_HASH_RE = /^(0x)?[A-Za-z0-9]{16,128}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

export function direccionValida(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  return DIRECCION_RE.test(v) ? v : null;
}

export function txHashValido(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  return TX_HASH_RE.test(v) ? v : null;
}

/**
 * Forma canónica para comparar direcciones: las EVM (0x + 40 hex) no distinguen
 * mayúsculas (el checksum EIP-55 solo cambia el caso); el resto, exactas.
 */
export function normalizarDireccion(address: string): string {
  const v = address.trim();
  return EVM_RE.test(v) ? v.toLowerCase() : v;
}
