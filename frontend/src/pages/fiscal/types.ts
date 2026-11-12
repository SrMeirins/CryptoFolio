export interface FiscalSummary {
  year: number
  esAnioEnCurso: boolean
  totalGanancias: number
  totalPerdidas: number
  netoPatrimonial: number
  numOperacionesPatrimoniales: number
  /** Rendimientos del capital mobiliario de la base del ahorro (staking, lending). */
  totalRendimientos: number
  numRendimientos: number
  /** Rentas de la base general, solo informativas (#537): airdrops, minería y cashback. */
  totalBaseGeneral: number
  numBaseGeneral: number
  valorTotal31Dic: number
  superaUmbral721: boolean
  umbral721: number
  /** Activos sin precio ahora: el valor es un mínimo (#267). */
  preciosPendientes: string[]
  valorIncompleto: boolean
}

export type CanalOperacion = 'orden' | 'convert' | 'saldos' | 'liquidacion'

export interface FiscalEvent {
  /** Día en Madrid (AAAA-MM-DD, #295). */
  fecha: string
  /** Instante exacto (ISO UTC) para el tooltip con la hora. */
  fechaHora?: string
  tipo: string
  activoTransmitido: string
  activoRecibido: string | null
  cantidadTransmitida: number
  contrapartidaClave: string
  contrapartidaDescripcion: string
  /** Sin clave segura (donación, pérdida): revisar antes de declarar (#531). */
  contrapartidaRevisar?: boolean
  valorTransmisionEur: number
  gastosTransmisionEur: number
  valorAdquisicionEur: number
  gastosAdquisicionEur: number
  gananciaPerdidaEur: number
  wallet: string
  txId: string
  /** Único por evento: una operación que consume varios lotes genera varios eventos con el mismo txId (#201). */
  eventId: string
  /** Día de compra del lote consumido (#543). */
  fechaAdquisicion?: string
  /**
   * Comisión de una compra que fue al coste de lo recibido (#543). Informativa:
   * no es gasto de esta fila; se deduce como gasto de adquisición al venderlo.
   */
  comisionCompraEur?: number
  /** Binance Convert: comisión incluida en el tipo de cambio, sin desglose (#543). */
  esConvert?: boolean
  /** Canal de la operación (#543): orden de mercado, Convert, saldos pequeños a BNB o liquidación. */
  canal?: CanalOperacion | null
  /** Cómo se valoró (#599): precio del momento, «el mayor» de los dos lados o precio del día. */
  valoracion?: 'momento' | 'mayor' | 'diario' | null
  /** Valores de los dos lados de la permuta en el momento, solo con «el mayor» (#599). */
  valorEntregadoEur?: number | null
  valorRecibidoEur?: number | null
  /** Recompra en ±2 meses de la venta con pérdida — art. 33.5 LIRPF, aplicación a cripto no pacífica. */
  posiblePerdidaDiferida?: boolean
  /** Pérdida 100% deducible computada sin motivo anotado (estafa, exchange insolvente...) — deducibilidad real por validar. */
  lostSinMotivo?: boolean
  /** Wrap/unwrap ETH↔BETH tratado como permuta imponible — criterio conservador, sin doctrina DGT específica. */
  permutaWrapStaking?: boolean
}

export interface RendimientoEvent {
  fecha: string
  fechaHora?: string
  tipo: string
  activo: string
  cantidad: number
  valorEur: number
  wallet: string
  /** Base del IRPF (#537): el ahorro entra en la cuota; la general solo se informa. */
  base: 'ahorro' | 'general'
  /** Transacción del rendimiento (#544), para enlazarla en Historial. */
  txId?: string
  /** Tipo de operación (STAKING_REWARD, AIRDROP…) (#544). */
  operacion?: string
  /** Precio por unidad al recibir (#544): de él salen el valor y el coste FIFO. */
  precioEur?: number
  /** Cuánto de lo recibido se ha transmitido ya y con qué resultado (#544); null sin lote (cobrado en EUR). */
  estado?: EstadoUnidades | null
}

/** Estado de las unidades de un rendimiento (#544). */
export interface EstadoUnidades {
  cantidad: number
  /** Lo que sigue en tu poder, en cualquier wallet. */
  conservada: number
  /** Lo que salió sin efecto fiscal: devolución de un préstamo de margen o comisión de red al coste. */
  sinEfecto: number
  transmitida: number
  resultadoEur: number
  anios: number[]
}

export interface Modelo721Activo {
  asset: string
  wallet_id: string
  wallet_name: string
  wallet_color: string
  wallet_kind: string
  quantity: number
  costBasisEur: number
  precioEur: number
  valorEur: number
  /** Sin precio a la fecha: valorEur = 0 (#267). */
  sinPrecio: boolean
}

export interface Modelo721 {
  year: number
  esAnioEnCurso: boolean
  fecha: string
  activos: Modelo721Activo[]
  totalValor: number
  totalValorCustodia: number
  superaUmbral: boolean
  umbral: number
  /** Activos sin precio ahora: los totales son un mínimo (#267). */
  preciosPendientes: string[]
  incompleto: boolean
  aviso: string
  /** Último 721 presentado antes de este ejercicio (#311). */
  ultimaPresentacion?: { ejercicio: number; valor: number } | null
  /** Obligación con la regla del incremento de 20.000 € (#311). */
  obligado?: boolean
  /** Este ejercicio ya se presentó. */
  presentado?: { declaradoEn: string; valor: number } | null
}

export interface YearOverview {
  year: number
  esAnioEnCurso: boolean
  totalGanancias: number
  totalPerdidas: number
  netoPatrimonial: number
  numOperaciones: number
  totalRendimientos: number
  /** Base del ahorro tras compensar y cuota estimada con la escala del año (#539). */
  base: number
  cuota: number
}

export interface CarryforwardDetalle {
  year: number
  netoAntes: number
  rendimientos: number
  perdida: number
  compensadoPatrim: number
  /** Total compensado con rendimientos, dentro del 25 % (art. 49 LIRPF). */
  compensadoRend: number
  /** Parte de `compensadoRend` que es la pérdida del propio año (#537). */
  compensadoRendAnio: number
  compensado: number
  limiteRend25: number
  netoDespues: number
}

/** Pérdida por año de origen (#305): original = compensado + pendiente + caducado. */
export interface OrigenPerdida {
  year: number
  original: number
  compensadoPatrim: number
  compensadoRend: number
  pendiente: number
  caducado: number
  /** Último ejercicio en que se puede compensar. */
  caducaEn: number
  /** Pérdida del año en curso: provisional, no suma al pendiente (#534). */
  provisional?: boolean
  /** Compensaciones año a año (#541): ejercicio en que se aplicó, con ganancias y con rendimientos. */
  aplicaciones?: Array<{ year: number; patrim: number; rend: number }>
}

export interface Carryforward {
  /** Pendiente de ejercicios cerrados, sin la pérdida provisional del año en curso (#534). */
  pendienteTotal: number
  pendienteProvisional?: number
  detalle: CarryforwardDetalle[]
  origenes?: OrigenPerdida[]
}

export interface BreakdownItem {
  asset: string
  ganancias: number
  perdidas: number
  neto: number
  operaciones: number
}

export interface MesData {
  mes: number
  label: string
  netoMes: number
  /** Ganancias (positivas) y pérdidas (negativas) del mes por separado (#539). */
  gananciasMes: number
  perdidasMes: number
  operacionesMes: number
  acumulado: number
}

export interface MonthlyData {
  meses: MesData[]
}
