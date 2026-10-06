import type { OperationCategory, OperationType } from './types';
import { ACQUISITION_OPERATIONS } from './acquisition';
import { INCOME_OPERATIONS } from './income';
import { DISPOSITION_OPERATIONS } from './disposition';
import { MOVEMENT_OPERATIONS } from './movement';
import { FEE_OPERATIONS } from './fee';
import { SPECIAL_OPERATIONS } from './special';

export type {
  FiscalTreatment,
  FifoEffect,
  OperationCategory,
  FieldName,
  FieldDefinition,
  OperationType,
} from './types';

export const OPERATION_CATALOG: OperationType[] = [
  ...ACQUISITION_OPERATIONS,
  ...INCOME_OPERATIONS,
  ...DISPOSITION_OPERATIONS,
  ...MOVEMENT_OPERATIONS,
  ...FEE_OPERATIONS,
  ...SPECIAL_OPERATIONS,
];

export function getOperationType(id: string): OperationType | undefined {
  return OPERATION_CATALOG.find((op) => op.id === id);
}

export function getOperationsByCategory(category: OperationCategory): OperationType[] {
  return OPERATION_CATALOG.filter((op) => op.category === category);
}

export const CATEGORY_META: Record<OperationCategory, { label: string; description: string; icon: string }> = {
  ACQUISITION: { label: 'Adquisicion',        description: 'Entrada de activos en tu portfolio',      icon: 'TrendingUp' },
  DISPOSITION: { label: 'Disposicion',         description: 'Salida o transmision de activos',         icon: 'TrendingDown' },
  MOVEMENT:    { label: 'Movimiento interno',  description: 'Transferencias entre wallets propias',    icon: 'ArrowLeftRight' },
  INCOME:      { label: 'Rendimiento',         description: 'Staking, lending, airdrops y otros',      icon: 'Coins' },
  FEE:         { label: 'Fee / Comision',      description: 'Gastos deducibles de red o exchange',     icon: 'Receipt' },
  SPECIAL:     { label: 'Especial',            description: 'Operaciones sin efecto o personalizadas', icon: 'Settings' },
};
