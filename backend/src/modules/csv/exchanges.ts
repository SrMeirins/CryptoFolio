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
