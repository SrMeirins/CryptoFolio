// ── Tratamiento fiscal según IRPF España ──────────────────────────────────
export type FiscalTreatment =
  | 'CAPITAL_GAIN'           // Ganancia/pérdida patrimonial — base ahorro IRPF
  | 'CAPITAL_INCOME'         // Rendimiento capital mobiliario — base ahorro IRPF
  | 'GENERAL_INCOME'         // Rendimiento actividad económica — base general
  | 'NO_TAXABLE_EVENT'       // Sin efecto fiscal (transferencia interna)
  | 'COST_BASIS_ZERO'        // Adquisición a coste 0 (fork, airdrop)
  | 'DEDUCTIBLE_EXPENSE';    // Gasto deducible (fees)

// ── Efecto en el motor FIFO ───────────────────────────────────────────────
export type FifoEffect =
  | 'OPEN_LOT'               // Abre lote FIFO
  | 'CLOSE_LOT'              // Cierra lote FIFO (genera G/P)
  | 'OPEN_AND_CLOSE_LOT'     // Cierra lote del activo pagado + abre lote nuevo
  | 'MOVE_LOT'               // Mueve lote entre wallets (sin G/P)
  | 'REDUCE_LOT'             // Reduce lote sin proceeds (pérdida total)
  | 'NO_EFFECT';             // Sin efecto en FIFO

// ── Categorías ────────────────────────────────────────────────────────────
export type OperationCategory =
  | 'ACQUISITION'
  | 'DISPOSITION'
  | 'MOVEMENT'
  | 'INCOME'
  | 'FEE'
  | 'SPECIAL';

// ── Campos dinámicos por tipo ─────────────────────────────────────────────
export type FieldName =
  | 'asset'              // Activo principal (XRP, BTC...)
  | 'amount'             // Cantidad del activo principal
  | 'cost_asset'         // Activo con el que se pagó (EUR, USDC...)
  | 'cost_amount'        // Cantidad pagada en cost_asset
  | 'price_eur'          // Precio unitario en EUR (si no se puede calcular)
  | 'fee_asset'          // Activo de la fee
  | 'fee_amount'         // Cantidad de fee
  | 'from_wallet'        // Wallet origen (para transferencias)
  | 'to_wallet'          // Wallet destino (para transferencias)
  | 'timestamp'          // Fecha y hora de la operación
  | 'notes'              // Notas libres
  | 'tx_hash'            // Hash de transacción on-chain (opcional)
  | 'exchange'           // Exchange/plataforma donde ocurrió
  | 'income_type';       // Para rendimientos: tipo de rendimiento

export interface FieldDefinition {
  name: FieldName;
  label: string;
  required: boolean;
  type: 'asset' | 'number' | 'wallet' | 'datetime' | 'text' | 'select';
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[]; // Para type='select'
}

// ── Definición completa de cada tipo de operación ─────────────────────────
export interface OperationType {
  id: string;
  category: OperationCategory;
  label: string;
  description: string;           // Descripción corta para la UI
  helper: string;                // Explicación detallada + cuándo usarlo
  fiscalHelper: string;          // Tratamiento fiscal en España
  fiscalTreatment: FiscalTreatment;
  fifoEffect: FifoEffect;
  fields: FieldDefinition[];
  example?: string;              // Ejemplo real
  badge: string;                 // Badge fiscal corto para mostrar en UI
  badgeColor: 'green' | 'red' | 'blue' | 'gray' | 'amber';
}

// ── CATÁLOGO COMPLETO ─────────────────────────────────────────────────────
export const OPERATION_CATALOG: OperationType[] = [

  // ════════════════════════════════════════════════════════════
  // ADQUISICIÓN
  // ════════════════════════════════════════════════════════════
  {
    id: 'BUY_FIAT',
    category: 'ACQUISITION',
    label: 'Compra con EUR',
    description: 'Compra de criptoactivo pagando con euros',
    helper: 'Usa este tipo cuando compras una cripto directamente con euros desde tu cuenta bancaria o con saldo EUR en el exchange. El coste de adquisición en EUR queda registrado como base del lote FIFO.',
    fiscalHelper: 'No genera evento fiscal en el momento de la compra. El lote FIFO queda abierto hasta que vendas o intercambies el activo. En ese momento se calculará la ganancia o pérdida patrimonial (base del ahorro, IRPF).',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'OPEN_LOT',
    badge: 'Sin efecto fiscal',
    badgeColor: 'gray',
    example: 'Compra 100 XRP a 1.20€/unidad pagando 120€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo comprado', required: true, type: 'asset', placeholder: 'XRP, BTC, ETH...' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number', placeholder: '100' },
      { name: 'cost_amount', label: 'EUR pagados', required: true, type: 'number', placeholder: '120.00', hint: 'Importe total incluyendo fees si las pagaste en EUR' },
      { name: 'fee_asset', label: 'Activo de la fee', required: false, type: 'asset', hint: 'Si la fee se pagó en otro activo (ej: BNB)' },
      { name: 'fee_amount', label: 'Cantidad de fee', required: false, type: 'number' },
      { name: 'exchange', label: 'Exchange / Plataforma', required: false, type: 'text', placeholder: 'Binance, Kraken...' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'BUY_CRYPTO',
    category: 'ACQUISITION',
    label: 'Compra con criptoactivo',
    description: 'Compra pagando con otra cripto o stablecoin (permuta)',
    helper: 'Usa este tipo cuando compras una cripto pagando con otra (ej: USDC→XRP, BTC→ETH). En España esto es una permuta: se cierra el FIFO del activo que entregas y se abre un lote nuevo del activo que recibes.',
    fiscalHelper: 'GENERA EVENTO FISCAL. Al entregar el activo pagado, Hacienda considera que lo has "vendido" al precio de mercado en ese momento. Se calcula la ganancia o pérdida patrimonial del activo entregado. Simultáneamente, el activo recibido abre un nuevo lote FIFO con el valor de mercado como coste de adquisición. Base del ahorro, IRPF.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'OPEN_AND_CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Compra 100 XRP pagando 120 USDC. Se cierra FIFO de 120 USDC y se abre lote de 100 XRP a 120€ (aprox.)',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo recibido', required: true, type: 'asset', placeholder: 'XRP, BTC...' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'cost_asset', label: 'Activo entregado', required: true, type: 'asset', placeholder: 'USDC, BTC...' },
      { name: 'cost_amount', label: 'Cantidad entregada', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR del activo entregado (ese día)', required: false, type: 'number', hint: 'Si lo dejas vacío se consultará automáticamente el precio histórico de Binance' },
      { name: 'fee_asset', label: 'Activo de la fee', required: false, type: 'asset' },
      { name: 'fee_amount', label: 'Cantidad de fee', required: false, type: 'number' },
      { name: 'exchange', label: 'Exchange / Plataforma', required: false, type: 'text' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'AIRDROP',
    category: 'ACQUISITION',
    label: 'Airdrop',
    description: 'Recepción gratuita de tokens',
    helper: 'Usa este tipo cuando recibes tokens de forma gratuita por parte de un proyecto (airdrop). No has pagado nada por ellos. El tratamiento fiscal en España está en debate, pero la postura más prudente es considerarlo rendimiento del capital mobiliario al precio de mercado del día de recepción.',
    fiscalHelper: 'Criterio prudente Hacienda España: se considera rendimiento del capital mobiliario (base del ahorro) por el valor de mercado en el momento de recepción. El lote FIFO se abre con ese valor como coste de adquisición. Cuando vendas, la diferencia entre precio de venta y coste de adquisición generará G/P patrimonial adicional.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 1000 tokens de un proyecto nuevo. Precio en el momento: 0.05€. Base imponible: 50€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora de recepción', required: true, type: 'datetime' },
      { name: 'asset', label: 'Token recibido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento de recepción', required: false, type: 'number', hint: 'Si lo dejas vacío se consultará automáticamente' },
      { name: 'from_wallet', label: 'Wallet de recepción', required: false, type: 'wallet' },
      { name: 'tx_hash', label: 'Hash de transacción on-chain', required: false, type: 'text', hint: 'Recomendado para justificar ante Hacienda' },
      { name: 'notes', label: 'Notas / Nombre del proyecto', required: false, type: 'text' },
    ],
  },

  {
    id: 'STAKING_REWARD',
    category: 'INCOME',
    label: 'Recompensa de Staking',
    description: 'Tokens recibidos como recompensa por hacer staking',
    helper: 'Usa este tipo cuando recibes tokens como recompensa por tener activos en staking (PoS, liquid staking, etc.). Cada recompensa genera un nuevo lote FIFO al precio de mercado del día de recepción.',
    fiscalHelper: 'Hacienda España: rendimiento del capital mobiliario (base del ahorro IRPF). Se tributa en el año de recepción por el valor de mercado en ese momento. El lote FIFO se abre con ese valor como coste. Cuando vendas los tokens recibidos, la diferencia generará G/P patrimonial.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 0.5 ETH de staking rewards. Precio: 2000€. Rendimiento a declarar: 1000€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Token recibido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento', required: false, type: 'number', hint: 'Se consultará automáticamente si se deja vacío' },
      { name: 'exchange', label: 'Plataforma de staking', required: false, type: 'text', placeholder: 'Binance, Lido, Rocket Pool...' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'MINING_REWARD',
    category: 'INCOME',
    label: 'Recompensa de Minería',
    description: 'Tokens recibidos como recompensa por minería',
    helper: 'Usa este tipo cuando recibes tokens por actividad de minería (PoW). En España se considera actividad económica si es habitual y con ánimo de lucro.',
    fiscalHelper: 'Hacienda España: si la minería es habitual y con ánimo de lucro, se considera rendimiento de actividad económica (base general IRPF, tipo marginal). Si es ocasional, puede considerarse rendimiento del capital mobiliario. Consulta con tu asesor fiscal. El lote FIFO se abre al valor de mercado del momento de recepción.',
    fiscalTreatment: 'GENERAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Actividad Económica',
    badgeColor: 'red',
    example: 'Minas 0.001 BTC. Precio: 70.000€. Ingreso a declarar: 70€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Token minado', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento', required: false, type: 'number' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'LENDING_INTEREST',
    category: 'INCOME',
    label: 'Interés de Lending',
    description: 'Intereses recibidos por prestar criptoactivos',
    helper: 'Usa este tipo cuando recibes intereses por tener activos en plataformas de lending (Binance Earn, Nexo, etc.). Cada pago de interés es un evento separado.',
    fiscalHelper: 'Hacienda España: rendimiento del capital mobiliario (base del ahorro IRPF). Se tributa en el año de recepción por el valor de mercado. El lote FIFO se abre con ese valor como coste de adquisición.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 10 USDC de intereses. Valor: 8.50€. Rendimiento a declarar: 8.50€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Token recibido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento', required: false, type: 'number' },
      { name: 'exchange', label: 'Plataforma', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'CASHBACK',
    category: 'INCOME',
    label: 'Cashback / Bonus',
    description: 'Recompensa en cripto por uso de tarjeta, referidos, promociones',
    helper: 'Usa este tipo para cashbacks en cripto de tarjetas (ej: Crypto.com), bonos de referido, o recompensas promocionales de exchanges.',
    fiscalHelper: 'Hacienda España: rendimiento del capital mobiliario (base del ahorro). Se tributa por el valor de mercado en el momento de recepción.',
    fiscalTreatment: 'CAPITAL_INCOME',
    fifoEffect: 'OPEN_LOT',
    badge: 'Rendimiento Cap. Mob.',
    badgeColor: 'amber',
    example: 'Recibes 5€ en CRO como cashback de tu tarjeta Crypto.com',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Token recibido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento', required: false, type: 'number' },
      { name: 'exchange', label: 'Plataforma', required: false, type: 'text' },
      { name: 'notes', label: 'Descripción del bonus', required: false, type: 'text' },
    ],
  },

  {
    id: 'FORK',
    category: 'ACQUISITION',
    label: 'Fork / Hard Fork',
    description: 'Recepción de tokens por fork de una blockchain',
    helper: 'Usa este tipo cuando recibes tokens nuevos como resultado de un fork (ej: BCH recibido por tener BTC). El coste de adquisición de los tokens recibidos se considera 0 o proporcional según el criterio de Hacienda.',
    fiscalHelper: 'Hacienda España: no hay doctrina clara. La postura más prudente es considerar el valor 0 como coste de adquisición, de modo que cuando vendas los tokens forkeados, el 100% del precio de venta será ganancia patrimonial. Algunos asesores defienden un reparto proporcional del coste original.',
    fiscalTreatment: 'COST_BASIS_ZERO',
    fifoEffect: 'OPEN_LOT',
    badge: 'Coste base 0',
    badgeColor: 'amber',
    example: 'Tenías 1 BTC cuando se produjo el fork de BCH. Recibes 1 BCH con coste de adquisición 0€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora del fork', required: true, type: 'datetime' },
      { name: 'asset', label: 'Token recibido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento (referencia)', required: false, type: 'number', hint: 'Solo referencia. El coste FIFO se registrará como 0' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Nombre del fork', required: false, type: 'text' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // DISPOSICIÓN
  // ════════════════════════════════════════════════════════════
  {
    id: 'SELL_FIAT',
    category: 'DISPOSITION',
    label: 'Venta a EUR',
    description: 'Venta de criptoactivo recibiendo euros',
    helper: 'Usa este tipo cuando vendes una cripto y recibes euros. Se cierran los lotes FIFO más antiguos (método FIFO) y se calcula la ganancia o pérdida patrimonial.',
    fiscalHelper: 'Hacienda España: ganancia o pérdida patrimonial (base del ahorro IRPF). Se calcula como precio de venta menos coste de adquisición FIFO. Si es ganancia, tributa al 19-28% según tramos. Si es pérdida, puede compensarse con ganancias del mismo año o de los 4 años siguientes.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Vendes 100 XRP a 2€/unidad recibiendo 200€. Coste FIFO: 120€. Ganancia: 80€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo vendido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad vendida', required: true, type: 'number' },
      { name: 'cost_amount', label: 'EUR recibidos', required: true, type: 'number' },
      { name: 'fee_asset', label: 'Activo de la fee', required: false, type: 'asset' },
      { name: 'fee_amount', label: 'Cantidad de fee', required: false, type: 'number', hint: 'La fee es deducible del precio de venta' },
      { name: 'exchange', label: 'Exchange / Plataforma', required: false, type: 'text' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'SELL_CRYPTO',
    category: 'DISPOSITION',
    label: 'Venta a criptoactivo',
    description: 'Intercambio de una cripto por otra (permuta)',
    helper: 'Usa este tipo cuando intercambias una cripto por otra. Es equivalente a BUY_CRYPTO desde la perspectiva del activo que entregas. Se cierra el FIFO del activo entregado y se abre un lote nuevo del activo recibido.',
    fiscalHelper: 'Hacienda España: misma lógica que BUY_CRYPTO. La entrega del activo se considera una transmisión que genera G/P patrimonial (base del ahorro). El valor de transmisión es el precio de mercado del activo entregado en el momento del intercambio.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'OPEN_AND_CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Intercambias 0.01 BTC por 600 XRP. Se cierra FIFO BTC y abre lote XRP',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo entregado', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad entregada', required: true, type: 'number' },
      { name: 'cost_asset', label: 'Activo recibido', required: true, type: 'asset' },
      { name: 'cost_amount', label: 'Cantidad recibida', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR del activo entregado (ese día)', required: false, type: 'number', hint: 'Se consultará automáticamente si se deja vacío' },
      { name: 'fee_asset', label: 'Activo de la fee', required: false, type: 'asset' },
      { name: 'fee_amount', label: 'Cantidad de fee', required: false, type: 'number' },
      { name: 'exchange', label: 'Exchange', required: false, type: 'text' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  {
    id: 'GIFT_SENT',
    category: 'DISPOSITION',
    label: 'Donación enviada',
    description: 'Envío gratuito de cripto a otra persona',
    helper: 'Usa este tipo cuando envías cripto a otra persona sin recibir nada a cambio (donación, regalo). No confundir con transferencia interna entre tus propias wallets.',
    fiscalHelper: 'Hacienda España: se considera transmisión a título lucrativo. El donante tributa por la diferencia entre el valor de mercado en el momento de la donación y el coste de adquisición FIFO. Puede generar ganancia patrimonial aunque no hayas recibido dinero.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'CLOSE_LOT',
    badge: 'G/P Patrimonial',
    badgeColor: 'red',
    example: 'Regalas 100 XRP a un amigo. Valor mercado: 200€. Coste FIFO: 120€. Ganancia: 80€',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo donado', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad donada', required: true, type: 'number' },
      { name: 'price_eur', label: 'Precio EUR en el momento', required: false, type: 'number', hint: 'Se consultará automáticamente' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text', hint: 'Muy recomendado para justificar ante Hacienda' },
      { name: 'notes', label: 'Notas / Destinatario', required: false, type: 'text' },
    ],
  },

  {
    id: 'LOST',
    category: 'DISPOSITION',
    label: 'Pérdida / Robo',
    description: 'Pérdida de acceso a fondos o robo',
    helper: 'Usa este tipo si has perdido acceso a fondos (pérdida de clave privada) o te han robado. La justificación documental es crucial para que Hacienda acepte la pérdida.',
    fiscalHelper: 'Hacienda España: pérdida patrimonial deducible si se puede acreditar la pérdida con pruebas documentales (denuncia, evidencia on-chain, etc.). Se cierra el FIFO por el coste de adquisición original y se declara pérdida total.',
    fiscalTreatment: 'CAPITAL_GAIN',
    fifoEffect: 'REDUCE_LOT',
    badge: 'Pérdida Patrimonial',
    badgeColor: 'red',
    example: 'Pierdes acceso a una wallet con 500 XRP. Coste de adquisición: 600€. Pérdida: 600€',
    fields: [
      { name: 'timestamp', label: 'Fecha aproximada', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo perdido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad perdida', required: true, type: 'number' },
      { name: 'from_wallet', label: 'Wallet afectada', required: false, type: 'wallet' },
      { name: 'tx_hash', label: 'Última tx conocida', required: false, type: 'text' },
      { name: 'notes', label: 'Descripción / Referencia denuncia', required: true, type: 'text', hint: 'Muy importante documentar para Hacienda' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // MOVIMIENTO INTERNO
  // ════════════════════════════════════════════════════════════
  {
    id: 'TRANSFER_INTERNAL',
    category: 'MOVEMENT',
    label: 'Transferencia interna',
    description: 'Movimiento entre wallets propias (Binance ↔ Tangem)',
    helper: 'Usa este tipo cuando muevas fondos entre wallets que son tuyas. El FIFO se mueve sin generar evento fiscal: el lote mantiene su coste de adquisición original y solo cambia la wallet donde está registrado.',
    fiscalHelper: 'Hacienda España: sin efecto fiscal. No hay transmisión porque el titular del activo no cambia. Las fees de red pagadas en el proceso sí pueden ser deducibles como gasto.',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'MOVE_LOT',
    badge: 'Sin efecto fiscal',
    badgeColor: 'gray',
    example: 'Envías 500 XRP de Binance a tu Tangem. El lote FIFO se mueve de BINANCE a TANGEM',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo transferido', required: true, type: 'asset' },
      { name: 'amount', label: 'Cantidad enviada (incluyendo fee de red)', required: true, type: 'number' },
      { name: 'from_wallet', label: 'Wallet origen', required: true, type: 'wallet' },
      { name: 'to_wallet', label: 'Wallet destino', required: true, type: 'wallet' },
      { name: 'fee_asset', label: 'Activo de la fee de red', required: false, type: 'asset' },
      { name: 'fee_amount', label: 'Fee de red', required: false, type: 'number' },
      { name: 'tx_hash', label: 'Hash de transacción on-chain', required: false, type: 'text', hint: 'Recomendado para trazabilidad' },
      { name: 'notes', label: 'Notas', required: false, type: 'text' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // FEES
  // ════════════════════════════════════════════════════════════
  {
    id: 'FEE_NETWORK',
    category: 'FEE',
    label: 'Fee de red',
    description: 'Gas fee o fee de red pagada en una transacción on-chain',
    helper: 'Usa este tipo para registrar fees de red (gas) pagadas en transacciones on-chain que no están asociadas a una compra o venta. Las fees de red vinculadas a una compraventa ya se recogen en esa operación.',
    fiscalHelper: 'Hacienda España: gasto deducible que reduce el precio de adquisición o incrementa el precio de transmisión, según corresponda. Si es una fee standalone, reduce el lote FIFO del activo gastado.',
    fiscalTreatment: 'DEDUCTIBLE_EXPENSE',
    fifoEffect: 'REDUCE_LOT',
    badge: 'Gasto Deducible',
    badgeColor: 'blue',
    example: 'Pagas 0.001 ETH de gas para interactuar con un smart contract',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'fee_asset', label: 'Activo de la fee', required: true, type: 'asset' },
      { name: 'fee_amount', label: 'Cantidad de fee', required: true, type: 'number' },
      { name: 'tx_hash', label: 'Hash de transacción', required: false, type: 'text' },
      { name: 'notes', label: 'Descripción de la operación', required: false, type: 'text' },
    ],
  },

  {
    id: 'FEE_EXCHANGE',
    category: 'FEE',
    label: 'Fee de exchange',
    description: 'Comisión cobrada por el exchange',
    helper: 'Usa este tipo para comisiones standalone cobradas por el exchange que no están vinculadas a una operación específica (ej: comisión mensual de custodia, fee de retiro no asociada a ningún activo concreto).',
    fiscalHelper: 'Hacienda España: gasto deducible. Reduce la base imponible si está vinculado a actividad de inversión.',
    fiscalTreatment: 'DEDUCTIBLE_EXPENSE',
    fifoEffect: 'REDUCE_LOT',
    badge: 'Gasto Deducible',
    badgeColor: 'blue',
    example: 'Binance cobra 5 USDC de fee de custodia mensual',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'fee_asset', label: 'Activo de la fee', required: true, type: 'asset' },
      { name: 'fee_amount', label: 'Cantidad de fee', required: true, type: 'number' },
      { name: 'exchange', label: 'Exchange', required: false, type: 'text' },
      { name: 'notes', label: 'Descripción', required: false, type: 'text' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // ESPECIAL
  // ════════════════════════════════════════════════════════════
  {
    id: 'IGNORED',
    category: 'SPECIAL',
    label: 'Ignorar',
    description: 'Operación sin efecto fiscal ni en portfolio',
    helper: 'Usa este tipo para operaciones internas del exchange (ajustes de balance, transferencias entre subcuentas del mismo exchange) o cualquier operación que no tenga efecto real en tu patrimonio. Se registra pero no afecta al FIFO ni al cálculo fiscal.',
    fiscalHelper: 'Sin efecto fiscal. La operación queda registrada en el historial pero no genera ningún cálculo.',
    fiscalTreatment: 'NO_TAXABLE_EVENT',
    fifoEffect: 'NO_EFFECT',
    badge: 'Sin efecto',
    badgeColor: 'gray',
    example: 'Transfer Between Main and Funding Wallet de Binance',
    fields: [
      { name: 'timestamp', label: 'Fecha y hora', required: true, type: 'datetime' },
      { name: 'asset', label: 'Activo (referencia)', required: false, type: 'asset' },
      { name: 'amount', label: 'Cantidad (referencia)', required: false, type: 'number' },
      { name: 'notes', label: 'Motivo por el que se ignora', required: false, type: 'text' },
    ],
  },
];

// ── Helpers de consulta ────────────────────────────────────────────────────
export function getOperationType(id: string): OperationType | undefined {
  return OPERATION_CATALOG.find((op) => op.id === id);
}

export function getOperationsByCategory(category: OperationCategory): OperationType[] {
  return OPERATION_CATALOG.filter((op) => op.category === category);
}

export const CATEGORY_META: Record<OperationCategory, { label: string; description: string; icon: string }> = {
  ACQUISITION: {
    label: 'Adquisición',
    description: 'Entrada de activos en tu portfolio',
    icon: 'TrendingUp',
  },
  DISPOSITION: {
    label: 'Disposición',
    description: 'Salida o transmisión de activos',
    icon: 'TrendingDown',
  },
  MOVEMENT: {
    label: 'Movimiento interno',
    description: 'Transferencias entre wallets propias',
    icon: 'ArrowLeftRight',
  },
  INCOME: {
    label: 'Rendimiento',
    description: 'Staking, lending, airdrops y otros ingresos',
    icon: 'Coins',
  },
  FEE: {
    label: 'Fee / Comisión',
    description: 'Gastos deducibles de red o exchange',
    icon: 'Receipt',
  },
  SPECIAL: {
    label: 'Especial',
    description: 'Operaciones sin efecto o personalizadas',
    icon: 'Settings',
  },
};
