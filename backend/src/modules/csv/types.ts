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

export type OperationType =
  | 'BUY'
  | 'SELL'
  | 'CONVERT_IN'
  | 'CONVERT_OUT'
  | 'DEPOSIT_FIAT'
  | 'DEPOSIT_CRYPTO'
  | 'WITHDRAW_FIAT'
  | 'WITHDRAW'
  | 'FEE_EXCHANGE'
  | 'FEE'
  | 'INTERNAL_TRANSFER'
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
