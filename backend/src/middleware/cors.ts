import cors, { CorsOptions } from 'cors';

// En modo Electron la ventana SIEMPRE carga http://127.0.0.1:<BACKEND_PORT>
// (nunca file:// — el backend sirve el frontend estático desde el mismo
// origen, ver el bloque "Frontend estático" de app.ts y electron/src/main.ts).
// Es una petición same-origin real: el navegador puede omitir la cabecera
// Origin, o enviar exactamente ese valor — nunca otro. Antes se aceptaba
// cualquier origen sin comprobar nada (cb(null, true) incondicional), lo que
// habría reflejado un origen arbitrario con credentials:true si el backend
// llegara a ser alcanzable desde fuera de Electron.
//
// Función pura (sin leer process.env directamente) para poder testearla de
// forma aislada sin tener que recargar el módulo completo de la app.
export function resolveCorsOrigin(env: {
  ELECTRON_MODE?: string;
  BACKEND_PORT?: string;
  CORS_ORIGIN?: string;
}): CorsOptions['origin'] {
  if (env.ELECTRON_MODE === 'true') {
    const ownOrigin = `http://127.0.0.1:${env.BACKEND_PORT ?? 3001}`;
    return (origin, cb) => {
      cb(null, origin === undefined || origin === ownOrigin);
    };
  }
  return env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

export function buildCorsMiddleware(env: NodeJS.ProcessEnv = process.env) {
  return cors({ origin: resolveCorsOrigin(env), credentials: true });
}
