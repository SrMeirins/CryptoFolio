/**
 * Preload script — se ejecuta en el proceso renderer ANTES de cargar la web.
 * contextIsolation: true → este script tiene acceso a Node.js pero el renderer NO.
 * Solo exponemos lo estrictamente necesario vía contextBridge.
 */
import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('__CRYPTOFOLIO__', {
  // La URL del backend — el renderer usa esto para saber dónde conectarse
  apiUrl: 'http://127.0.0.1:3001',
  wsUrl:  'ws://127.0.0.1:3001',

  // Versión de la app (para mostrar en UI o comprobar actualizaciones)
  version: process.env.npm_package_version ?? '0.0.0',

  // Permite al renderer saber que está corriendo en Electron
  isElectron: true,

  // Abrir una URL en el navegador del sistema (no en Electron)
  openExternal: (url: string) => shell.openExternal(url),

  // Escuchar eventos del proceso principal (actualizaciones, etc.)
  onUpdateAvailable: (cb: (info: unknown) => void) =>
    ipcRenderer.on('update-available', (_e, info) => cb(info)),

  onUpdateDownloaded: (cb: (info: unknown) => void) =>
    ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),

  installUpdate: () => ipcRenderer.send('install-update'),
});
