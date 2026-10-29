import { z } from 'zod';
import type { Response } from 'express';

// Errores de validación (#385). Zod 4 trae los mensajes por defecto en
// castellano (z.locales.es); los mensajes propios de cada esquema se mantienen.
// La configuración es global: basta con que este módulo se cargue antes de
// validar, y lo cargan todas las rutas a través de sendZodError.
z.config(z.locales.es());

/**
 * Mensaje 400 legible a partir de los issues de zod, sin detalles internos
 * (solo la ruta del campo y el mensaje de validación).
 */
export function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

export function sendZodError(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: `Datos inválidos: ${zodErrorMessage(error)}` });
}
