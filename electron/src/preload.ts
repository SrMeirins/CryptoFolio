/**
 * Preload script — se ejecuta en el proceso renderer ANTES de cargar la web.
 * contextIsolation: true → este script tiene acceso a Node.js pero el renderer NO.
 * Solo exponemos lo estrictamente necesario vía contextBridge.
 */
import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('__CRYPTOFOLIO__', {
  apiUrl:     'http://127.0.0.1:3001',
  wsUrl:      'ws://127.0.0.1:3001',
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
