import { z } from 'zod';

// Validación de la API de alertas (#519): una alerta de precio necesita un
// activo con formato de símbolo, sentido, un precio positivo y finito, su
// moneda y la repetición; la de cartera, un umbral entre 0 y 1000 %. Que el
// activo exista se comprueba contra asset_metadata en la ruta.

const symbol = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,20}$/, 'activo no válido');
const precio = z.number({ error: 'precio debe ser un número' }).finite('precio debe ser finito').positive('precio debe ser positivo').max(1e12, 'precio demasiado alto');
const umbral = z.number({ error: 'umbral_pct debe ser un número' }).finite().positive('umbral_pct debe ser positivo').max(1000, 'umbral_pct no puede pasar de 1000');
const sentido = z.enum(['por_encima', 'por_debajo'], { error: 'sentido debe ser por_encima o por_debajo' });
const moneda = z.enum(['EUR', 'USD'], { error: 'moneda debe ser EUR o USD' });
const repeticion = z.enum(['una_vez', 'cada_vez'], { error: 'repeticion debe ser una_vez o cada_vez' });

export const crearAlertaSchema = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('precio'), activo: symbol, sentido, precio, moneda: moneda.default('EUR'), repeticion: repeticion.default('una_vez') }),
  z.strictObject({ tipo: z.literal('cartera'), umbral_pct: umbral }),
], { error: 'tipo debe ser precio o cartera' });
export type CrearAlerta = z.infer<typeof crearAlertaSchema>;

export const editarAlertaSchema = z.strictObject({
  activa: z.boolean().optional(),
  sentido: sentido.optional(),
  precio: precio.optional(),
  moneda: moneda.optional(),
  repeticion: repeticion.optional(),
  umbral_pct: umbral.optional(),
}).refine(v => Object.keys(v).length > 0, { error: 'no hay nada que cambiar' });
export type EditarAlerta = z.infer<typeof editarAlertaSchema>;

export const idSchema = z.uuid('id no válido');
