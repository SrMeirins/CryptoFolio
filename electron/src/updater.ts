import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { setSplashAlwaysOnTop, setSplashStatus } from './splash';

// ── Estado de actualización ─────────────────────────────────────────────────
// Persiste entre la comprobación inicial y la carga de la ventana principal
let pendingUpdateVersion: string | null = null;
let updateDownloaded = false;

export interface UpdaterDeps {
  getMainWindow: () => BrowserWindow | null;
  // Para el backend/postgres, no para el auto-updater: hay que pararlos
  // ANTES de que el instalador sustituya los binarios o de salir.
  beforeInstall: () => Promise<void>;
}

/** IPC expuesto al renderer vía preload.ts. Llamar una sola vez al arrancar. */
export function registerUpdateIpcHandlers(deps: UpdaterDeps): void {
  ipcMain.handle('get-update-status', () => ({
    available:  pendingUpdateVersion !== null,
    downloaded: updateDownloaded,
    version:    pendingUpdateVersion,
  }));

  ipcMain.handle('download-and-install', async () => {
    await deps.beforeInstall();
    if (updateDownloaded) {
      autoUpdater.quitAndInstall(false, true);
      return;
    }
    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall(false, true);
  });
}

// ── Comprobación de actualizaciones al arrancar ─────────────────────────────
// Se ejecuta ANTES de levantar postgres — si hay update y el usuario acepta,
// ni siquiera arrancamos la base de datos.
export async function checkForUpdateOnStartup(isDev: boolean, deps: UpdaterDeps): Promise<void> {
  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  return new Promise<void>((resolve) => {
    // Timeout: si en 6s no responde GitHub, continuamos el arranque normal
    const timeout = setTimeout(() => {
      cleanupListeners();
      resolve();
    }, 6000);

    function cleanupListeners() {
      autoUpdater.removeListener('update-available',     onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error',                onError);
    }

    async function onAvailable(info: { version: string }) {
      clearTimeout(timeout);
      cleanupListeners();

      setSplashAlwaysOnTop(false);
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Actualización disponible',
        message: `Nueva versión ${info.version} disponible`,
        detail: '¿Deseas descargar e instalar la actualización ahora?\nLa aplicación se reiniciará automáticamente.',
        buttons: ['Actualizar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
      });
      setSplashAlwaysOnTop(true);

      if (response === 0) {
        // Usuario acepta → descargar y reiniciar (sin arrancar postgres)
        setSplashStatus('Descargando actualización...');

        autoUpdater.on('download-progress', (p) => {
          setSplashStatus(`Descargando actualización... ${Math.round(p.percent)}%`);
        });

        autoUpdater.once('update-downloaded', async () => {
          setSplashStatus('Instalando...');
          // Parar postgres antes de que el instalador sustituya los binarios.
          await deps.beforeInstall();
          autoUpdater.quitAndInstall(false, true);
        });

        autoUpdater.downloadUpdate().catch(() => resolve());
        // No llamamos resolve() aquí — la app se reiniciará sola
      } else {
        // Usuario pospone → guardar estado, iniciar descarga en segundo plano
        pendingUpdateVersion = info.version;

        autoUpdater.downloadUpdate().catch(() => {});

        autoUpdater.once('update-downloaded', () => {
          updateDownloaded = true;
          deps.getMainWindow()?.webContents.send('update-downloaded', { version: info.version });
        });

        resolve();
      }
    }

    function onNotAvailable() {
      clearTimeout(timeout);
      cleanupListeners();
      resolve();
    }

    function onError(err: Error) {
      clearTimeout(timeout);
      cleanupListeners();
      console.warn('[updater] Error al comprobar actualizaciones:', err?.message ?? String(err));
      resolve();
    }

    autoUpdater.on('update-available',     onAvailable);
    autoUpdater.on('update-not-available', onNotAvailable);
    autoUpdater.on('error',                onError);

    autoUpdater.checkForUpdates().catch(() => {
      clearTimeout(timeout);
      cleanupListeners();
      resolve();
    });
  });
}

// ── Comprobación periódica (cada hora, una vez la app está corriendo) ───────
export function schedulePeriodicUpdateCheck(isDev: boolean, deps: UpdaterDeps): void {
  if (isDev) return;

  setInterval(async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return;
      // Si hay versión nueva y aún no la teníamos, notificar a la ventana
      const newVersion = (result.updateInfo as { version: string }).version;
      if (newVersion && newVersion !== app.getVersion() && !pendingUpdateVersion) {
        pendingUpdateVersion = newVersion;
        deps.getMainWindow()?.webContents.send('update-available', { version: newVersion });
        autoUpdater.downloadUpdate().catch(() => {});
      }
    } catch { /* silencioso */ }
  }, 60 * 60 * 1000);
}
