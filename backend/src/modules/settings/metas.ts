import { z } from 'zod';

// Metas de inversión (#520): lista JSON en app_config bajo la clave «metas».
// Se escribe con el PUT genérico de configuración, que la valida con este
// esquema antes de guardarla, y viaja en la copia de seguridad con app_config.

export const METAS_KEY = 'metas';
export const MAX_METAS = 6;
export const MAX_NOMBRE_META = 40;
export const TIPOS_META = ['valor', 'aportado', 'cantidad'] as const;

const id = z.string().regex(/^[A-Za-z0-9-]{8,40}$/);
const nombre = z.string().trim().min(1).max(MAX_NOMBRE_META);
// Objetivo positivo y finito, con un techo amplio para cortar valores absurdos.
const objetivo = z.number().finite().positive().max(1e12);
const moneda = z.enum(['EUR', 'USD']);
const activo = z.string().regex(/^[A-Z0-9]{1,20}$/);

/** Metas de importe (valor total o aportado en el año) con su moneda; de cantidad, con su activo. */
export const metaSchema = z.discriminatedUnion('tipo', [
  z.strictObject({ id, nombre, tipo: z.literal('valor'), objetivo, moneda }),
  z.strictObject({ id, nombre, tipo: z.literal('aportado'), objetivo, moneda }),
  z.strictObject({ id, nombre, tipo: z.literal('cantidad'), objetivo, activo }),
]);

export const metasListSchema = z.array(metaSchema).max(MAX_METAS)
  .refine(l => new Set(l.map(m => m.id)).size === l.length, 'id repetido');

/** Valor de la clave: texto JSON con hasta MAX_METAS metas válidas y sin id repetidos. */
export const metasSchema = z.string().refine(raw => {
  try {
    return metasListSchema.safeParse(JSON.parse(raw)).success;
  } catch { return false; }
}, `${METAS_KEY}: lista JSON de hasta ${MAX_METAS} metas válidas`);
