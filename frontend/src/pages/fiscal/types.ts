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
}

export interface FiscalEvent {
  fecha: string
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
}

export interface RendimientoEvent {
  fecha: string
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
}

export interface Modelo721 {
  year: number
  esAnioEnCurso: boolean
  fecha: string
  activos: Modelo721Activo[]
  totalValor: number
  superaUmbral: boolean
  umbral: number
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

export interface Carryforward {
  pendienteTotal: number
  detalle: CarryforwardDetalle[]
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
  proyeccionFinAnio: number | null
}
