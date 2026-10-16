import { ZodError } from 'zod';
import { Response } from 'express';

// Construye un mensaje 400 legible en castellano a partir de los issues de
// Zod, sin filtrar detalles internos sensibles.
export function zodErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

export function sendZodError(res: Response, error: ZodError): void {
  res.status(400).json({ error: `Datos inválidos: ${zodErrorMessage(error)}` });
}

export function parseYear(raw: string): number | null {
  // Exactamente 4 dígitos (#295): parseInt aceptaba «2024abc» o «2024.5».
  if (!/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  if (y < 2009 || y > 2100) return null; // Bitcoin nació en 2009
  return y;
}
