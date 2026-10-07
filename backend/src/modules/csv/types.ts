// Tipos para el parser CSV de Binance

export interface RawCsvRow {
  userId: string;
  time: Date;
  account: 'Spot' | 'Funding' | string;
  operation: string;
  coin: string;
  change: number;
  remark: string;
  rowHash: string;
}

// Fila cruda (columnas originales del CSV) emparejada con el hash que el
// propio parser calculó UNA sola vez. Antes, importer.ts volvía a parsear
// el CSV y recalculaba occurrenceIndex/rowHash por su cuenta para resolver
// destinos de transferencia interna — dos fórmulas de hash para la misma
// fila que, si se desincronizan, fallan en silencio (incidente real,
// 2026-09-29). Exponer esto aquí hace que haya una única fuente de verdad.
export interface RawRowWithHash {
  record: Record<string, string>;
  hash: string;
}

// CONVERT_IN/CONVERT_OUT/INTERNAL_TRANSFER NO están aquí a propósito: eran
// valores muertos que ningún parser llegó a producir nunca, y el enum
// operation_type de la BD ya no los tiene (eliminados en el squash de
// schema.sql, Nivel 2) — mantenerlos en este tipo permitiría construir una
// ParsedTransaction que pase el type-check pero cuyo INSERT fallaría en BD.
export type OperationType =
  | 'BUY'
  | 'SELL'
  | 'DEPOSIT_FIAT'
  | 'DEPOSIT_CRYPTO'
  | 'WITHDRAW_FIAT'
  | 'WITHDRAW'
  | 'FEE_EXCHANGE'
  | 'FEE'
  | 'TRANSFER_INTERNAL'
  | 'STAKING_LOCK'
  | 'STAKING_UNLOCK'
  | 'LAUNCHPOOL_LOCK'
  | 'LAUNCHPOOL_UNLOCK'
  | 'STAKING_REWARD'
  | 'MINING_REWARD'
  | 'LENDING_INTEREST'
  | 'LENDING_INTEREST_LOCKED'
  | 'CASHBACK'
  | 'AIRDROP'
  | 'FORK'
  | 'GIFT_SENT'
  | 'LOST'
  | 'MARGIN_BORROW'
  | 'MARGIN_REPAY'
  | 'IGNORED';

export interface ParsedTransaction {
  operationType: OperationType;
  timestamp: Date;
  // Activo principal recibido o gastado
  asset: string;
  amount: number;        // Bruto
  amountNet: number;     // Neto (descontando fees en mismo activo)
  // Contrapartida (con qué se pagó)
  costAsset?: string;
  costAmount?: number;   // Siempre positivo
  // Precio unitario
  pricePerUnit?: number; // costAmount / amount en costAsset
  // Fees
  feeAsset?: string;
  feeAmount?: number;    // Siempre positivo
  // Meta
  account: string;
  notes?: string;
  subTradeCount: number;
  rawRowHashes: string[];
  needsCostReview?: boolean;  // depósito externo: coste de adquisición desconocido
}

// Lo que devuelve el parser completo
export interface CsvParseResult {
  transactions: ParsedTransaction[];
  ignoredRows: RawCsvRow[];
  errors: ParseError[];
  // Filas crudas + hash, en el mismo orden de lectura del CSV. Permite a
  // importer.ts resolver metadatos que necesitan el CSV original (ej. qué
  // cuenta recibió una transferencia interna) sin volver a parsear el
  // archivo ni recalcular el hash por su cuenta.
  rawRows: RawRowWithHash[];
  stats: {
    totalRows: number;
    parsedRows: number;
    ignoredRows: number;
    errorRows: number;
    transactionCount: number;
  };
}

export interface ParseError {
  rows: RawCsvRow[];
  message: string;
}
