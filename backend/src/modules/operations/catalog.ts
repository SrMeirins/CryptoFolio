export type FiscalTreatment =
  | 'CAPITAL_GAIN'
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

export const OPERATION_CATALOG: OperationType[] = [

  // ── ADQUISICIÓN ────────────────────────────────────────────────────────
  {
    id: 'BUY_FIAT',
    category: 'ACQUISITION',
    label: 'Compra con EUR',
    description: 'Compra de criptoactivo pagando con euros',
    helper: 'Usa este tipo cuando compras una cripto directamente con euros. El precio historico se consulta automaticamente de Binance si no lo introduces.',
    fiscalHelper: 'No genera evento fiscal en el momento de la compra. El lote FIFO queda abierto hasta que vendas o intercambies el activo.',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'OPEN_LOT',
    badge: 'Sin efecto fiscal',
    badgeColor: 'gray',
    example: 'Compra 100 XRP a 1.20 EUR/unidad pagando 120 EUR',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',           required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo comprado',        required: true,  type: 'asset',   placeholder: 'XRP, BTC, ETH...' },
      { name: 'amount',      label: 'Cantidad recibida',      required: true,  type: 'number',  placeholder: '100' },
      { name: 'cost_amount', label: 'EUR pagados',            required: false, type: 'number',  hint: 'Opcional. Si no se introduce se calcula con el precio historico de Binance', auto: true },
      { name: 'price_eur',   label: 'Precio unitario EUR',    required: false, type: 'number',  hint: 'Opcional. Se consulta automaticamente de Binance', auto: true },
      { name: 'fee_asset',   label: 'Activo de la fee',       required: false, type: 'asset' },
      { name: 'fee_amount',  label: 'Cantidad de fee',        required: false, type: 'number' },
      { name: 'from_wallet', label: 'Wallet',                 required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Exchange / Plataforma',  required: false, type: 'text',    placeholder: 'Binance, Kraken...' },
      { name: 'tx_hash',     label: 'Hash de transaccion',    required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',                  required: false, type: 'text' },
    ],
  },

  {
    id: 'BUY_CRYPTO',
    category: 'ACQUISITION',
    label: 'Compra con criptoactivo',
    description: 'Compra pagando con otra cripto o stablecoin (permuta)',
    helper: 'Usa este tipo cuando compras una cripto pagando con otra. Es una permuta fiscal en Espana.',
    fiscalHelper: 'GENERA EVENTO FISCAL. Al entregar el activo pagado se considera una venta al precio de mercado. Se calcula G/P del activo entregado.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'OPEN_AND_CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Compra 100 XRP pagando 120 USDC',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',                    required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo recibido',                 required: true,  type: 'asset',   placeholder: 'XRP, BTC...' },
      { name: 'amount',      label: 'Cantidad recibida',               required: true,  type: 'number' },
      { name: 'cost_asset',  label: 'Activo entregado',                required: true,  type: 'asset',   placeholder: 'USDC, BTC...' },
      { name: 'cost_amount', label: 'Cantidad entregada',              required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR del activo entregado', required: false, type: 'number',  hint: 'Opcional. Se consulta automaticamente de Binance', auto: true },
      { name: 'fee_asset',   label: 'Activo de la fee',                required: false, type: 'asset' },
      { name: 'fee_amount',  label: 'Cantidad de fee',                 required: false, type: 'number' },
      { name: 'from_wallet', label: 'Wallet',                          required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Exchange',                        required: false, type: 'text' },
      { name: 'tx_hash',     label: 'Hash de transaccion',             required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',                           required: false, type: 'text' },
    ],
  },

  {
    id: 'AIRDROP',
    category: 'ACQUISITION',
    label: 'Airdrop',
    description: 'Recepcion gratuita de tokens',
    helper: 'Tokens recibidos gratuitamente. El precio historico se consulta automaticamente.',
    fiscalHelper: 'Criterio prudente Hacienda Espana: rendimiento del capital mobiliario por el valor de mercado en el momento de recepcion.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 1000 tokens de un proyecto nuevo',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora de recepcion', required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Token recibido',            required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad recibida',         required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR en el momento',  required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente de Binance', auto: true },
      { name: 'from_wallet', label: 'Wallet de recepcion',       required: true,  type: 'wallet' },
      { name: 'tx_hash',     label: 'Hash de transaccion',       required: false, type: 'text',   hint: 'Recomendado para justificar ante Hacienda' },
      { name: 'notes',       label: 'Notas / Nombre del proyecto', required: false, type: 'text' },
    ],
  },

  {
    id: 'FORK',
    category: 'ACQUISITION',
    label: 'Fork / Hard Fork',
    description: 'Recepcion de tokens por fork de una blockchain',
    helper: 'Tokens recibidos por un fork. El coste de adquisicion se registra como 0.',
    fiscalHelper: 'Hacienda Espana: coste de adquisicion 0. Cuando vendas, el 100% del precio sera ganancia patrimonial.',
    fiscalTreatment: 'COST_BASIS_ZERO',
    fifoEffect: 'OPEN_LOT',
    badge: 'Coste base 0',
    badgeColor: 'amber',
    example: 'Recibes 1 BCH por tener 1 BTC en el momento del fork',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora del fork', required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Token recibido',        required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad recibida',     required: true,  type: 'number' },
      { name: 'from_wallet', label: 'Wallet',                required: true,  type: 'wallet' },
      { name: 'tx_hash',     label: 'Hash de transaccion',   required: false, type: 'text' },
      { name: 'notes',       label: 'Nombre del fork',       required: false, type: 'text' },
    ],
  },

  // ── INCOME ────────────────────────────────────────────────────────────
  {
    id: 'STAKING_REWARD',
    category: 'INCOME',
    label: 'Recompensa de Staking',
    description: 'Tokens recibidos por hacer staking',
    helper: 'Recompensas de staking. El precio historico se consulta automaticamente de Binance.',
    fiscalHelper: 'Hacienda Espana: rendimiento del capital mobiliario. Se tributa en el ano de recepcion por el valor de mercado.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 0.5 ETH de staking rewards',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',          required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Token recibido',        required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad recibida',     required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR',            required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente de Binance', auto: true },
      { name: 'from_wallet', label: 'Plataforma / Wallet',   required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Plataforma de staking', required: false, type: 'text',   placeholder: 'Binance, Lido...' },
      { name: 'tx_hash',     label: 'Hash de transaccion',   required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',                 required: false, type: 'text' },
    ],
  },

  {
    id: 'MINING_REWARD',
    category: 'INCOME',
    label: 'Recompensa de Mineria',
    description: 'Tokens recibidos por mineria',
    helper: 'Recompensas de mineria. El precio historico se consulta automaticamente.',
    fiscalHelper: 'Hacienda Espana: si la mineria es habitual, rendimiento de actividad economica (base general). Si es ocasional, rendimiento del capital mobiliario.',
    fiscalTreatment: 'GENERAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Actividad Economica',
    badgeColor: 'red',
    example: 'Minas 0.001 BTC',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',        required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Token minado',        required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad recibida',   required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR',          required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente', auto: true },
      { name: 'from_wallet', label: 'Wallet',              required: true,  type: 'wallet' },
      { name: 'tx_hash',     label: 'Hash de transaccion', required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',               required: false, type: 'text' },
    ],
  },

  {
    id: 'LENDING_INTEREST',
    category: 'INCOME',
    label: 'Interes de Lending',
    description: 'Intereses recibidos por prestar criptoactivos',
    helper: 'Intereses de plataformas de lending. El precio historico se consulta automaticamente.',
    fiscalHelper: 'Hacienda Espana: rendimiento del capital mobiliario.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 10 USDC de intereses de Binance Earn',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',     required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Token recibido',   required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad',         required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR',       required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente', auto: true },
      { name: 'from_wallet', label: 'Wallet',           required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Plataforma',       required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',            required: false, type: 'text' },
    ],
  },

  {
    id: 'CASHBACK',
    category: 'INCOME',
    label: 'Cashback / Bonus',
    description: 'Recompensa en cripto por uso de tarjeta, referidos o promociones',
    helper: 'Cashbacks y bonos en cripto. El precio historico se consulta automaticamente.',
    fiscalHelper: 'Hacienda Espana: rendimiento del capital mobiliario.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 5 EUR en CRO como cashback',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',             required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Token recibido',           required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad',                 required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR',               required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente', auto: true },
      { name: 'from_wallet', label: 'Wallet',                   required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Plataforma',               required: false, type: 'text' },
      { name: 'notes',       label: 'Descripcion del bonus',    required: false, type: 'text' },
    ],
  },

  // ── DISPOSICION ────────────────────────────────────────────────────────
  {
    id: 'SELL_FIAT',
    category: 'DISPOSITION',
    label: 'Venta a EUR',
    description: 'Venta de criptoactivo recibiendo euros',
    helper: 'Venta a EUR. Si no introduces los EUR recibidos, se calcula con el precio historico de Binance.',
    fiscalHelper: 'Hacienda Espana: ganancia o perdida patrimonial (base del ahorro IRPF). Se calcula precio venta menos coste FIFO.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Vendes 100 XRP a 2 EUR recibiendo 200 EUR',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',        required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo vendido',      required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad vendida',    required: true,  type: 'number' },
      { name: 'cost_amount', label: 'EUR recibidos',       required: false, type: 'number', hint: 'Opcional. Se calcula con el precio historico de Binance', auto: true },
      { name: 'price_eur',   label: 'Precio unitario EUR', required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente', auto: true },
      { name: 'fee_asset',   label: 'Activo de la fee',    required: false, type: 'asset' },
      { name: 'fee_amount',  label: 'Cantidad de fee',     required: false, type: 'number', hint: 'Deducible del precio de venta' },
      { name: 'from_wallet', label: 'Wallet',              required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Exchange',            required: false, type: 'text' },
      { name: 'tx_hash',     label: 'Hash de transaccion', required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',               required: false, type: 'text' },
    ],
  },

  {
    id: 'SELL_CRYPTO',
    category: 'DISPOSITION',
    label: 'Venta a criptoactivo',
    description: 'Intercambio de una cripto por otra (permuta)',
    helper: 'Intercambio entre criptos. Genera evento fiscal por el activo entregado.',
    fiscalHelper: 'Hacienda Espana: G/P patrimonial por el activo entregado al precio de mercado en el momento del intercambio.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'OPEN_AND_CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Intercambias 0.01 BTC por 600 XRP',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',                    required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo entregado',                required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad entregada',              required: true,  type: 'number' },
      { name: 'cost_asset',  label: 'Activo recibido',                 required: true,  type: 'asset' },
      { name: 'cost_amount', label: 'Cantidad recibida',               required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR del activo entregado', required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente', auto: true },
      { name: 'fee_asset',   label: 'Activo de la fee',                required: false, type: 'asset' },
      { name: 'fee_amount',  label: 'Cantidad de fee',                 required: false, type: 'number' },
      { name: 'from_wallet', label: 'Wallet',                          required: true,  type: 'wallet' },
      { name: 'exchange',    label: 'Exchange',                        required: false, type: 'text' },
      { name: 'tx_hash',     label: 'Hash de transaccion',             required: false, type: 'text' },
      { name: 'notes',       label: 'Notas',                           required: false, type: 'text' },
    ],
  },

  {
    id: 'GIFT_SENT',
    category: 'DISPOSITION',
    label: 'Donacion enviada',
    description: 'Envio gratuito de cripto a otra persona',
    helper: 'Envio sin contraprestacion. Genera evento fiscal aunque no recibas dinero.',
    fiscalHelper: 'Hacienda Espana: transmision a titulo lucrativo. El donante tributa por la diferencia entre valor de mercado y coste FIFO.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Regalas 100 XRP a un amigo',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',                required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo donado',               required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad donada',             required: true,  type: 'number' },
      { name: 'price_eur',   label: 'Precio EUR en el momento',    required: false, type: 'number', hint: 'Opcional. Se consulta automaticamente', auto: true },
      { name: 'from_wallet', label: 'Wallet',                      required: true,  type: 'wallet' },
      { name: 'tx_hash',     label: 'Hash de transaccion',         required: false, type: 'text',   hint: 'Muy recomendado para justificar ante Hacienda' },
      { name: 'notes',       label: 'Notas / Destinatario',        required: false, type: 'text' },
    ],
  },

  {
    id: 'LOST',
    category: 'DISPOSITION',
    label: 'Perdida / Robo',
    description: 'Perdida de acceso a fondos o robo',
    helper: 'Perdida de fondos por robo o perdida de clave. Requiere documentacion para Hacienda.',
    fiscalHelper: 'Hacienda Espana: perdida patrimonial deducible si se puede acreditar con pruebas documentales.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'REDUCE_LOT',
    badge: 'Perdida Patrimonial',
    badgeColor: 'red',
    example: 'Pierdes acceso a una wallet con 500 XRP',
    fields: [
      { name: 'timestamp',   label: 'Fecha aproximada',                    required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo perdido',                      required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad perdida',                    required: true,  type: 'number' },
      { name: 'from_wallet', label: 'Wallet afectada',                     required: true,  type: 'wallet' },
      { name: 'tx_hash',     label: 'Ultima tx conocida',                  required: false, type: 'text' },
      { name: 'notes',       label: 'Descripcion / Referencia denuncia',   required: false, type: 'text', hint: 'Importante documentar para Hacienda' },
    ],
  },

  // ── MOVIMIENTO ─────────────────────────────────────────────────────────
  {
    id: 'TRANSFER_INTERNAL',
    category: 'MOVEMENT',
    label: 'Transferencia interna',
    description: 'Movimiento entre wallets propias',
    helper: 'Transferencia entre wallets tuyas. Sin evento fiscal. El lote FIFO mantiene su coste original.',
    fiscalHelper: 'Hacienda Espana: sin efecto fiscal. No hay cambio de titular.',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'MOVE_LOT',
    badge: 'Sin efecto fiscal',
    badgeColor: 'gray',
    example: 'Envias 500 XRP de Binance a tu Tangem',
    fields: [
      { name: 'timestamp',   label: 'Fecha y hora',                            required: true,  type: 'datetime' },
      { name: 'asset',       label: 'Activo transferido',                      required: true,  type: 'asset' },
      { name: 'amount',      label: 'Cantidad enviada (incluyendo fee de red)', required: true,  type: 'number' },
      { name: 'from_wallet', label: 'Wallet origen',                           required: true,  type: 'wallet' },
      { name: 'to_wallet',   label: 'Wallet destino',                          required: true,  type: 'wallet' },
      { name: 'fee_asset',   label: 'Activo de la fee de red',                 required: false, type: 'asset' },
      { name: 'fee_amount',  label: 'Fee de red',                              required: false, type: 'number' },
      { name: 'tx_hash',     label: 'Hash de transaccion on-chain',            required: false, type: 'text',   hint: 'Recomendado para trazabilidad' },
      { name: 'notes',       label: 'Notas',                                   required: false, type: 'text' },
    ],
  },

  // ── FEE ───────────────────────────────────────────────────────────────
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

  // ── ESPECIAL ───────────────────────────────────────────────────────────
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
      { name: 'timestamp', label: 'Fecha y hora',           required: true,  type: 'datetime' },
      { name: 'asset',     label: 'Activo (referencia)',     required: false, type: 'asset' },
      { name: 'amount',    label: 'Cantidad (referencia)',   required: false, type: 'number' },
      { name: 'notes',     label: 'Motivo por el que se ignora', required: false, type: 'text' },
    ],
  },
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