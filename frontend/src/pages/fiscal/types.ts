export interface FiscalSummary {
  year: number
  esAnioEnCurso: boolean
  totalGanancias: number
  totalPerdidas: number
  netoPatrimonial: number
  numOperacionesPatrimoniales: number
  totalRendimientos: number
  numRendimientos: number
  valorTotal31Dic: number
  superaUmbral721: boolean
  umbral721: number
  /** Activos sin precio ahora: el valor es un mínimo (#267). */
  preciosPendientes: string[]
  valorIncompleto: boolean
}

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
  valorTransmisionEur: number
  gastosTransmisionEur: number
  valorAdquisicionEur: number
  gastosAdquisicionEur: number
  gananciaPerdidaEur: number
  wallet: string
  txId: string
  /** Único por evento: una operación que consume varios lotes genera varios eventos con el mismo txId (#201). */
  eventId: string
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
}

export interface YearOverview {
  year: number
  esAnioEnCurso: boolean
  totalGanancias: number
  totalPerdidas: number
  netoPatrimonial: number
  numOperaciones: number
  totalRendimientos: number
}

export interface CarryforwardDetalle {
  year: number
  netoAntes: number
  rendimientos: number
  perdida: number
  compensadoPatrim: number
  compensadoRend: number
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
}

export interface Carryforward {
  pendienteTotal: number
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
  acumulado: number
}

export interface MonthlyData {
  meses: MesData[]
}
