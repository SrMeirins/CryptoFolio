import { z } from 'zod';
import { MUTED_KEY, mutedSchema } from '../notifications/preferences';
import { autoBackupSchemas } from '../backup/autoBackupSettings';
import { METAS_KEY, metasSchema } from './metas';
import { DASHBOARD_DISENO_KEY, dashboardDisenoSchema } from './dashboardDiseno';

// Preferencias de General (#446): claves de app_config con un conjunto cerrado
// de valores. El PUT genérico las valida antes de guardarlas.

export const DUST_THRESHOLD_KEY = 'dust_threshold_eur';
export const PRIVACY_ON_START_KEY = 'privacy_on_start';
export const START_PAGE_KEY = 'start_page';
/** Peso de la mayor posición a partir del cual Portfolio avisa de concentración (#525). */
export const CONCENTRACION_KEY = 'concentracion_aviso_pct';
/** Peso por debajo del cual una wallet va a «Otras» en Portfolio (#526). */
export const WALLETS_OTRAS_KEY = 'wallets_otras_pct';
/** Columnas visibles de la tabla de posiciones de Portfolio (#527); Activo y Valor van siempre. */
export const PORTFOLIO_COLUMNAS_KEY = 'portfolio_columnas';
export const PORTFOLIO_COLUMNAS = ['cantidad', 'precio', 'tendencia', 'coste', 'pnl', 'resultado', 'breakeven', 'antiguedad', 'peso', 'maximo90', 'ingresos'] as const;

/** Cómo se marcan compras y ventas en el gráfico de precio del detalle del activo (#528). */
export const GRAFICO_MARCAS_KEY = 'grafico_marcas';
export const GRAFICO_MARCAS = ['puntos', 'banderas-arriba', 'banderas-abajo'] as const;

/** Páginas que se pueden elegir como inicio. */
export const START_PAGES = ['/', '/portfolio', '/fiscal', '/history'] as const;

/** Umbral de polvo en euros: de 0 a 1.000, con hasta dos decimales y punto decimal. */
export const dustThresholdSchema = z.string()
  .regex(/^\d{1,4}(\.\d{1,2})?$/, 'dust_threshold_eur debe ser un importe en euros con hasta dos decimales')
  .refine(v => Number(v) <= 1000, 'dust_threshold_eur no puede superar 1000');

export const preferenceSchemas: Record<string, z.ZodType<string>> = {
  [DUST_THRESHOLD_KEY]: dustThresholdSchema,
  [PRIVACY_ON_START_KEY]: z.enum(['true', 'false'], { error: 'privacy_on_start debe ser true o false' }),
  [START_PAGE_KEY]: z.enum(START_PAGES, { error: 'start_page debe ser una de las páginas de inicio permitidas' }),
  // Aviso de concentración (#525): porcentaje entero de 10 a 100.
  // Wallets en «Otras» (#526): porcentaje entero de 0 (nunca) a 20.
  // Columnas de Portfolio (#527): JSON con una lista sin repetir de columnas conocidas.
  [PORTFOLIO_COLUMNAS_KEY]: z.string().max(400).refine(v => {
    try {
      const lista = JSON.parse(v);
      return z.array(z.enum(PORTFOLIO_COLUMNAS)).max(PORTFOLIO_COLUMNAS.length).safeParse(lista).success && new Set(lista).size === lista.length;
    } catch { return false; }
  }, `${PORTFOLIO_COLUMNAS_KEY}: lista JSON de columnas conocidas sin repetir`),
  [GRAFICO_MARCAS_KEY]: z.enum(GRAFICO_MARCAS, { error: `${GRAFICO_MARCAS_KEY} debe ser puntos, banderas-arriba o banderas-abajo` }),
  [WALLETS_OTRAS_KEY]: z.string().regex(/^\d{1,2}$/, `${WALLETS_OTRAS_KEY} debe ser un porcentaje entero`)
    .refine(v => Number(v) <= 20, `${WALLETS_OTRAS_KEY} va de 0 a 20`),
  [CONCENTRACION_KEY]: z.string().regex(/^\d{2,3}$/, `${CONCENTRACION_KEY} debe ser un porcentaje entero`)
    .refine(v => Number(v) >= 10 && Number(v) <= 100, `${CONCENTRACION_KEY} va de 10 a 100`),
  // Categorías de avisos silenciadas (#447).
  [MUTED_KEY]: mutedSchema,
  // Copias automáticas (#454).
  ...autoBackupSchemas,
  // Metas de inversión (#520): lista JSON validada.
  [METAS_KEY]: metasSchema,
  // Diseño del Dashboard (#521): orden, ocultos y contraídos.
  [DASHBOARD_DISENO_KEY]: dashboardDisenoSchema,
};
