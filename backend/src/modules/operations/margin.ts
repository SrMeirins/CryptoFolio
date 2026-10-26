import type { OperationType } from './types';

// Préstamo y devolución de margen (#394). Solo llegan importados del CSV de
// Binance; el catálogo los incluye para poder editarlos, no para crearlos.

const MARGIN_FIELDS: OperationType['fields'] = [
  { name: 'timestamp',   label: 'Fecha y hora', required: true,  type: 'datetime' },
  { name: 'asset',       label: 'Activo',       required: true,  type: 'asset' },
  { name: 'amount',      label: 'Cantidad',     required: true,  type: 'number' },
  { name: 'from_wallet', label: 'Wallet',       required: true,  type: 'wallet' },
  { name: 'notes',       label: 'Notas',        required: false, type: 'text' },
];

export const MARGIN_OPERATIONS: OperationType[] = [
  {
    id: 'MARGIN_BORROW',
    category: 'SPECIAL',
    label: 'Préstamo de margen',
    description: 'Activo recibido en préstamo en una cuenta de margen',
    helper: 'Préstamo importado de la cuenta de margen. Abre un lote con el activo prestado.',
    fiscalHelper: 'Sin efecto fiscal. La deuda se salda con la devolución de margen.',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'OPEN_LOT',
    badge: 'Sin efecto fiscal',
    badgeColor: 'gray',
    editOnly: true,
    fields: MARGIN_FIELDS,
  },
  {
    id: 'MARGIN_REPAY',
    category: 'SPECIAL',
    label: 'Devolución de margen',
    description: 'Devolución del préstamo de margen y sus intereses',
    helper: 'Devolución importada de la cuenta de margen. Consume lotes del activo devuelto.',
    fiscalHelper: 'Lo que devuelves hasta la deuda pendiente no tiene efecto fiscal; el exceso son intereses y cuenta como pérdida.',
    fiscalTreatment: 'DEDUCTIBLE_EXPENSE',
    fifoEffect: 'CLOSE_LOT',
    badge: 'Intereses deducibles',
    badgeColor: 'amber',
    editOnly: true,
    fields: MARGIN_FIELDS,
  },
];
