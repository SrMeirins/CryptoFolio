import { z } from 'zod';

// Diseño del Dashboard (#521): orden de los paneles, ocultos y contraídos, en
// app_config bajo «dashboard_diseno». Lo escribe el PUT genérico de
// configuración, que lo valida con este esquema, y viaja en la copia de
// seguridad con app_config. Las tarjetas KPI van siempre arriba y no entran.

export const DASHBOARD_DISENO_KEY = 'dashboard_diseno';
export const PANELES_DASHBOARD = [
  'metas', 'variacion', 'evolucion', 'rendimiento', 'pnl-diario', 'distribucion', 'fiscal', 'actividad', 'ingresos',
] as const;

const panel = z.enum(PANELES_DASHBOARD);
const sinRepetir = (l: readonly string[]) => new Set(l).size === l.length;
const lista = z.array(panel).max(PANELES_DASHBOARD.length).refine(sinRepetir, 'panel repetido');

/**
 * Orden con paneles conocidos sin repetir (puede faltar alguno: el cliente lo
 * coloca en su sitio por defecto) y listas de ocultos y contraídos.
 */
export const disenoSchema = z.strictObject({ orden: lista, ocultos: lista, contraidos: lista });

export const dashboardDisenoSchema = z.string().max(1000).refine(raw => {
  try {
    return disenoSchema.safeParse(JSON.parse(raw)).success;
  } catch { return false; }
}, `${DASHBOARD_DISENO_KEY}: JSON con orden, ocultos y contraidos de paneles conocidos sin repetir`);
