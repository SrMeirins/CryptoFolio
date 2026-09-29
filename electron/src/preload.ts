/**
 * Preload script — se ejecuta en el proceso renderer ANTES de cargar la web.
 * contextIsolation: true → este script tiene acceso a Node.js pero el renderer NO.
 * Solo exponemos lo estrictamente necesario vía contextBridge.
 */
import { contextBridge, ipcRenderer, shell } from 'electron';

// apiUrl/wsUrl no se exponen: el frontend se sirve siempre desde el propio
// backend (mismo origen), así que usa rutas relativas (/api, /ws) — no
// necesita conocer el puerto. Además, desde que el puerto del backend se
// elige dinámicamente en cada arranque (ver shared/find-free-port.ts), un
// valor fijo aquí habría quedado incorrecto.
contextBridge.exposeInMainWorld('__CRYPTOFOLIO__', {
  isElectron: true,

  openExternal: (url: string) => shell.openExternal(url),

  // ── Actualizaciones ───────────────────────────────────────────────────────
  // Estado actual: si hay update pendiente y si ya está descargado
  getUpdateStatus: (): Promise<{ available: boolean; downloaded: boolean; version: string | null }> =>
    ipcRenderer.invoke('get-update-status'),

  // Descarga el update (si no estaba descargado) e instala reiniciando la app
  downloadAndInstall: (): Promise<void> =>
    ipcRenderer.invoke('download-and-install'),

  // Eventos push desde el proceso principal
  onUpdateAvailable: (cb: (info: { version: string }) => void) =>
    ipcRenderer.on('update-available', (_e, info) => cb(info)),

  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),
});
