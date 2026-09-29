// Bases de puerto para la app de escritorio — deliberadamente POCO comunes.
// Antes: backend fijo en 3001 (uno de los puertos Node.js más usados) y
// Postgres embebido fijo en 54321 (el puerto por defecto del Postgres local
// de Supabase) — colisiones reales y frecuentes si el usuario tenía Docker
// u otra app corriendo (reportado por el usuario tras desplegar en Linux y
// Windows). findFreePort() (ver find-free-port.ts) escanea hacia arriba
// desde aquí en CADA arranque — estas bases nunca se usan directamente sin
// comprobar primero que están libres.
export const BACKEND_PORT_BASE = 47100;
export const POSTGRES_PORT_BASE = 47500;
