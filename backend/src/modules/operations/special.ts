import type { OperationType } from './types';

export const SPECIAL_OPERATIONS: OperationType[] = [
  {
    id: 'IGNORED',
    category: 'SPECIAL',
    label: 'Ignorar',
    description: 'Operacion sin efecto fiscal ni en portfolio',
    helper: 'Para operaciones internas del exchange o ajustes de balance sin efecto real.',
    fiscalHelper: 'Sin efecto fiscal. Queda registrada en el historial pero no genera ningun calculo.',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'NO_EFFECT',
    badge: 'Sin efecto',
    badgeColor: 'gray',
    example: 'Transfer Between Main and Funding Wallet de Binance',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',                required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo (referencia)',          required: false, type: 'asset' },
      { name: 'amount',      label: 'Cantidad (referencia)',        required: false, type: 'number' },
      { name: 'from_wallet', label: 'Wallet (referencia)',          required: false, type: 'wallet' },
      { name: 'notes',       label: 'Motivo por el que se ignora',  required: false, type: 'text' },
    ],
  },
];
