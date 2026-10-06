import helmet from 'helmet';

// Cabeceras de seguridad (helmet) + CSP explícita.
//
// El frontend nunca llama a Binance/CoinGecko directamente — todo pasa por
// el backend (modules/prices/), que no está sujeto a esta CSP (solo rige
// fetch/WebSocket del navegador). connectSrc se limita a lo que el
// frontend sí consume: el propio origen y el WebSocket local de precios.
export const securityHeaders = helmet({
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'"],
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          ["'self'", 'data:'],
      connectSrc:      [
        "'self'",
        // WebSocket local (dev y Electron)
        'ws://localhost:*',
        'wss://localhost:*',
      ],
      frameAncestors:  ["'none'"],
      formAction:      ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
});
