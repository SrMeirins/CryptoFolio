import type { OperationType } from './types';

export const FEE_OPERATIONS: OperationType[] = [
  {
    id: 'FEE_NETWORK',
    category: 'FEE',
    label: 'Fee de red',
    description: 'Gas fee o fee de red pagada en una transaccion on-chain',
    helper: 'Fee de red standalone no asociada a una compraventa concreta.',
    fiscalHelper: 'Hacienda Espana: gasto deducible.',
    fiscalTreatment: 'DEDUCTIBLE_EXPENSE',
    fifoEffect: 'REDUCE_LOT',
    badge: 'Gasto Deducible',
    badgeColor: 'blue',
    example: 'Pagas 0.001 ETH de gas para interactuar con un contrato',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',        required: true,  type: 'datetime' },
      { name: 'fee_asset',   label: 'Activo de la fee',    required: true,  type: 'asset' },
      { name: 'fee_amount',  label: 'Cantidad de fee',     required: true,  type: 'number' },
      { name: 'from_wallet', label: 'Wallet',              required: true,  type: 'wallet' },
      { name: 'tx_hash',     label: 'Hash de transaccion', required: false, type: 'text' },
      { name: 'notes',       label: 'Descripcion',         required: false, type: 'text' },
    ],
  },

  {
    id: 'FEE_EXCHANGE',
    category: 'FEE',
    label: 'Fee de exchange',
    description: 'Comision cobrada por el exchange no asociada a una operacion',
    helper: 'Comisiones standalone del exchange como custodia mensual.',
    fiscalHelper: 'Hacienda Espana: gasto deducible vinculado a actividad de inversion.',
    fiscalTreatment: 'DEDUCTIBLE_EXPENSE',
    fifoEffect: 'REDUCE_LOT',
    badge: 'Gasto Deducible',
    badgeColor: 'blue',
    example: 'Binance cobra 5 USDC de fee de custodia mensual',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',     required: true,  type: 'datetime' },
      { name: 'fee_asset',   label: 'Activo de la fee', required: true,  type: 'asset' },
      { name: 'fee_amount',  label: 'Cantidad de fee',  required: true,  type: 'number' },
      { name: 'from_wallet', label: 'Wallet',           required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Exchange',         required: false, type: 'text' },
      { name: 'notes',       label: 'Descripcion',      required: false, type: 'text' },
    ],
  },
];
