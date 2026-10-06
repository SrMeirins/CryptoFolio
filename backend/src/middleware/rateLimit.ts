import rateLimit from 'express-rate-limit';

// El backend escucha en 127.0.0.1 para un único usuario local (Electron).
// Este límite previene loops accidentales; no es un límite de seguridad
// frente a terceros (no hay acceso externo).
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
