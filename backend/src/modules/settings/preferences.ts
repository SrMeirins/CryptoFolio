import { z } from 'zod';

// Preferencias de General (#446): claves de app_config con un conjunto cerrado
// de valores. El PUT genérico las valida antes de guardarlas.

export const DUST_THRESHOLD_KEY = 'dust_threshold_eur';
export const PRIVACY_ON_START_KEY = 'privacy_on_start';
export const START_PAGE_KEY = 'start_page';

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
};
