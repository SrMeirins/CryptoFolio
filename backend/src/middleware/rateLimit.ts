import rateLimit from 'express-rate-limit';

// El backend escucha en 127.0.0.1 para un único usuario local (Electron).
// Este límite previene loops accidentales; no es un límite de seguridad
// frente a terceros (no hay acceso externo).

/** Peticiones por ventana de 15 minutos si no se configura otra cosa. */
export const RATE_LIMIT_MAX_DEFAULT = 5000;

/**
 * Límite de peticiones por ventana (RATE_LIMIT_MAX). Solo se acepta un entero
 * entre 1 y 1.000.000; cualquier otro valor deja el de siempre, así que un
 * error de configuración nunca quita el límite. El entorno de desarrollo y la
 * CI lo suben para que la suite e2e completa no choque con él.
 */
export function rateLimitMax(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : RATE_LIMIT_MAX_DEFAULT;
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: rateLimitMax(process.env.RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
