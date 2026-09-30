import { app, BrowserWindow, dialog, Menu } from 'electron';
import { PostgresManager } from './postgres-manager';
import { BackendManager } from './backend-manager';
import { SecretsManager } from './secrets-manager';
import { createSplash, setSplashStatus, closeSplash } from './splash';
import { createWindow } from './window';
import { registerUpdateIpcHandlers, checkForUpdateOnStartup, schedulePeriodicUpdateCheck, UpdaterDeps } from './updater';
import { findFreePort } from './shared/find-free-port';
import { BACKEND_PORT_BASE } from './shared/ports';

const isDev = process.env.NODE_ENV === 'development';

app.setName('CryptoFolio');

process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

let mainWindow:   BrowserWindow | null = null;
let postgresManager: PostgresManager;
let backendManager:  BackendManager;
// Puerto real del backend, resuelto una vez en startup() — 'activate'
// (macOS) reabre ventana reusando el mismo backend ya arrancado, así que
// necesita el mismo puerto, no uno nuevo.
let backendPort = BACKEND_PORT_BASE;

// ── Seguridad: un solo proceso ──────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let shuttingDown = false;
let handlingStartupError = false;

async function shutdown(): Promise<void> {
  console.log('[app] Cerrando...');
  backendManager?.stop();
  await postgresManager?.stop();
}

// beforeInstall: parar backend/postgres antes de que el instalador de la
// actualización sustituya los binarios, o de salir para instalar. Marca
// shuttingDown=true para que before-quit no interfiera y deje que
// electron-updater complete su propio ciclo de quit → install → relaunch.
const updaterDeps: UpdaterDeps = {
  getMainWindow: () => mainWindow,
  beforeInstall: async () => {
    shuttingDown = true;
    await shutdown().catch(() => {});
  },
};

registerUpdateIpcHandlers(updaterDeps);

// ── Startup ─────────────────────────────────────────────────────────────────
async function startup(): Promise<void> {
  console.log('[app] Iniciando CryptoFolio...');

  setSplashStatus('Iniciando base de datos...');
  console.log('[app] Arrancando PostgreSQL...');
  postgresManager = new PostgresManager();
  await postgresManager.start();
  console.log('[app] PostgreSQL listo.');

  // Clave de cifrado de API keys on-chain: se genera una vez y se persiste
  // (no hay .env editable por el usuario final en la app de escritorio).
  const secretsManager = new SecretsManager(app.getPath('userData'));
  secretsManager.loadOrCreate();

  setSplashStatus('Iniciando servidor...');
  console.log('[app] Arrancando backend...');
  backendPort = await findFreePort(BACKEND_PORT_BASE);
  backendManager = new BackendManager({
    port: backendPort,
    databaseUrl: postgresManager.connectionString,
    walletSyncEncryptionKey: secretsManager.walletSyncEncryptionKey,
    onCrash: async (detail) => {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Error crítico — CryptoFolio',
        message: 'El backend ha fallado inesperadamente.',
        detail,
        buttons: ['Cerrar'],
      });
      app.quit();
    },
  });
  await backendManager.start();
  console.log('[app] Backend listo.');
  setSplashStatus('');
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!isDev) Menu.setApplicationMenu(null);

  createSplash(isDev);

  try {
    // 1. Comprobar actualizaciones antes de levantar postgres
    setSplashStatus('Comprobando actualizaciones...');
    await checkForUpdateOnStartup(isDev, updaterDeps);
    setSplashStatus('');

    // 2. Levantar postgres + backend
    await startup();

    // 3. Crear ventana principal
    mainWindow = await createWindow(
      isDev,
      backendPort,
      () => closeSplash(),
      () => { mainWindow = null; },
    );

    // 4. Iniciar comprobaciones periódicas en segundo plano
    schedulePeriodicUpdateCheck(isDev, updaterDeps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? 'Error desconocido');
    console.error('[app] Error fatal en startup:', message);
    // Cerrar el splash ANTES del diálogo: el splash tiene alwaysOnTop y lo taparía.
    // El flag evita que window-all-closed dispare app.quit() mientras esperamos al usuario.
    handlingStartupError = true;
    closeSplash();
    await dialog.showMessageBox({
      type: 'error',
      title: 'Error al iniciar CryptoFolio',
      message: 'No se pudo iniciar la aplicación.',
      detail: message,
      buttons: ['Cerrar'],
    });
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !handlingStartupError) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(
      isDev,
      backendPort,
      () => closeSplash(),
      () => { mainWindow = null; },
    ).then((w) => { mainWindow = w; });
  }
});

// before-quit es síncrono en Electron — el async no se awaita.
// Usamos event.preventDefault() + app.exit() para esperar el shutdown de postgres
// antes de salir. Sin esto, el proceso muere mientras postgres sigue vivo,
// dejando un bloque de memoria compartida huérfano que impide el siguiente arranque.
app.on('before-quit', (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  const forceExit = setTimeout(() => app.exit(0), 8000);
  shutdown().finally(() => {
    clearTimeout(forceExit);
    app.exit(0);
  });
});
