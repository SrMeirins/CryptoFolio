import { Activity, CalendarClock, CalendarDays, Coins, Gauge, History, Landmark, LineChart, PieChart, Target, type LucideIcon } from 'lucide-react'
import type { PanelId } from '../utils/dashboardDiseno'
import { T } from '../utils/colors'

// Nombre, icono, color y qué muestra cada panel del Dashboard (#521). El
// nombre y el icono son los de su cabecera; el color y la descripción, los de
// su miniatura en el modo Personalizar y en el minimapa.
export const PANEL_INFO: Record<PanelId, { titulo: string; icono: LucideIcon; color: string; detalle: string }> = {
  resumen: { titulo: 'Últimos 7 días', icono: CalendarClock, color: T.brand, detalle: 'Qué ha pasado esta semana, de un vistazo' },
  metas: { titulo: 'Metas', icono: Target, color: T.brand, detalle: 'Progreso de tus metas de inversión' },
  variacion: { titulo: 'Variación', icono: Activity, color: T.warning, detalle: 'Qué sube y qué baja hoy, activo a activo' },
  evolucion: { titulo: 'Evolución', icono: LineChart, color: T.brand, detalle: 'Curva del valor y del P&L con zoom' },
  rendimiento: { titulo: 'Rendimiento', icono: Gauge, color: T.positive, detalle: 'Rentabilidad por periodos y riesgo' },
  'pnl-diario': { titulo: 'P&L diario', icono: CalendarDays, color: T.info, detalle: 'Resultado de cada día y calendario' },
  distribucion: { titulo: 'Distribución', icono: PieChart, color: T.purple, detalle: 'Reparto por activo y por wallet' },
  fiscal: { titulo: 'Fiscal', icono: Landmark, color: T.warning, detalle: 'Resultado fiscal del ejercicio' },
  actividad: { titulo: 'Actividad reciente', icono: History, color: T.info, detalle: 'Últimas operaciones y mapa de actividad' },
  ingresos: { titulo: 'Ingresos pasivos', icono: Coins, color: T.positive, detalle: 'Staking, intereses y otros ingresos' },
}
