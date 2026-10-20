import { parseBinanceCsv } from './parser';
import { parseBitvavoCsv } from './bitvavoParser';
import { validateCsvStructure, ValidationResult } from './validator';
import { validateBitvavoCsvStructure } from './bitvavoValidator';
import { CsvParseResult } from './types';

export type Exchange = 'binance' | 'bitvavo';

export const SUPPORTED_EXCHANGES: Exchange[] = ['binance', 'bitvavo'];

export function isExchange(value: unknown): value is Exchange {
  return typeof value === 'string' && (SUPPORTED_EXCHANGES as string[]).includes(value);
}

export async function parseExchangeCsv(exchange: Exchange, fileBuffer: Buffer): Promise<CsvParseResult> {
  switch (exchange) {
    case 'binance': return parseBinanceCsv(fileBuffer);
    case 'bitvavo': return parseBitvavoCsv(fileBuffer);
  }
}

export function validateExchangeCsv(exchange: Exchange, fileBuffer: Buffer): ValidationResult {
  switch (exchange) {
    case 'binance': return validateCsvStructure(fileBuffer);
    case 'bitvavo': return validateBitvavoCsvStructure(fileBuffer);
  }
}

export interface DeteccionExchange {
  /** null si las cabeceras no corresponden a ningún formato conocido. */
  exchange: Exchange | null;
  /** Idioma detectado (solo Binance exporta en varios idiomas). */
  idioma: string;
}

/**
 * Exchange del CSV por sus cabeceras (#318): se prueba cada formato soportado
 * y gana el que valida la estructura. Así no hay que elegirlo antes de subir.
 */
export function detectarExchange(fileBuffer: Buffer): DeteccionExchange {
  const binance = validateCsvStructure(fileBuffer);
  if (binance.valid || binance.detectedLanguage !== 'unknown') return { exchange: 'binance', idioma: binance.detectedLanguage };
  const bitvavo = validateBitvavoCsvStructure(fileBuffer);
  if (bitvavo.valid) return { exchange: 'bitvavo', idioma: 'en' };
  return { exchange: null, idioma: 'unknown' };
}

/** Cabeceras que se esperan de cada exchange, para explicar un archivo no reconocido. */
export const CABECERAS_ESPERADAS: Record<Exchange, string> = {
  binance: 'User ID, Time, Account, Operation, Coin, Change, Remark (o su versión en español)',
  bitvavo: 'Timezone, Date, Time, Type, Currency, Amount, Quote Currency, Quote Price…',
};
