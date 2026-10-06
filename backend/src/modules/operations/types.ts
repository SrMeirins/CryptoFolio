export type FiscalTreatment =
  | 'CAPITAL_GAIN_LOSS'
  | 'CAPITAL_INCOME'
  | 'GENERAL_INCOME'
  | 'NO_TAXABLE_EVENT'
  | 'COST_BASIS_ZERO'
  | 'DEDUCTIBLE_EXPENSE';

export type FifoEffect =
  | 'OPEN_LOT'
  | 'CLOSE_LOT'
  | 'OPEN_AND_CLOSE_LOT'
  | 'MOVE_LOT'
  | 'REDUCE_LOT'
  | 'NO_EFFECT';

export type OperationCategory =
  | 'ACQUISITION'
  | 'DISPOSITION'
  | 'MOVEMENT'
  | 'INCOME'
  | 'FEE'
  | 'SPECIAL';

export type FieldName =
  | 'asset'
  | 'amount'
  | 'cost_asset'
  | 'cost_amount'
  | 'price_eur'
  | 'fee_asset'
  | 'fee_amount'
  | 'from_wallet'
  | 'to_wallet'
  | 'timestamp'
  | 'notes'
  | 'tx_hash'
  | 'exchange'
  | 'income_type';

export interface FieldDefinition {
  name: FieldName;
  label: string;
  required: boolean;
  type: 'asset' | 'number' | 'wallet' | 'datetime' | 'text' | 'select';
  placeholder?: string;
  hint?: string;
  auto?: boolean; // Se calcula automaticamente si no se introduce
  options?: { value: string; label: string }[];
}

export interface OperationType {
  id: string;
  category: OperationCategory;
  label: string;
  description: string;
  helper: string;
  fiscalHelper: string;
  fiscalTreatment: FiscalTreatment;
  fifoEffect: FifoEffect;
  fields: FieldDefinition[];
  example?: string;
  badge: string;
  badgeColor: 'green' | 'red' | 'blue' | 'gray' | 'amber';
}
