// Puerto por defecto del backend en modo Electron — única fuente de verdad.
// Usado por preload.ts (apiUrl/wsUrl expuestos al renderer), main.ts (URL de
// carga de la ventana + lista blanca de navegación) y backend-manager.ts
// (valor por defecto si no se especifica otro puerto). Antes estaba
// hardcodeado por separado en los 4 sitios — riesgo real de divergencia si
// alguno cambiaba sin actualizar los demás.
export const DEFAULT_BACKEND_PORT = 3001;
