import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { PostgresManager } from './postgres-manager';
import { BackendManager } from './backend-manager';

const isDev = process.env.NODE_ENV === 'development';

// Linux icon/taskbar association:
// - --class sets the X11 WM_CLASS (must match StartupWMClass in the .desktop file)
// - setDesktopFileName tells GNOME Wayland which .desktop file owns this window
// Both must be called before app.whenReady().
// On Linux, force WM_CLASS to match StartupWMClass in the .desktop file.
// Without this Electron reports 'cryptofolio' (lowercase) and GNOME can't
// match it to the desktop entry, showing a generic gear icon instead.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('class', 'CryptoFolio');
}
app.setName('CryptoFolio');

process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

let mainWindow:   BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let postgresManager: PostgresManager;
let backendManager:  BackendManager;

// ── Estado de actualización ─────────────────────────────────────────────────
// Persiste entre la comprobación inicial y la carga de la ventana principal
let pendingUpdateVersion: string | null = null;
let updateDownloaded = false;

// ── Seguridad: un solo proceso ──────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── IPC de actualización ────────────────────────────────────────────────────
ipcMain.handle('get-update-status', () => ({
  available:  pendingUpdateVersion !== null,
  downloaded: updateDownloaded,
  version:    pendingUpdateVersion,
}));

ipcMain.handle('download-and-install', async () => {
  shuttingDown = true;
  await shutdown().catch(() => {});
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
    return;
  }
  await autoUpdater.downloadUpdate();
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('install-update', async () => {
  shuttingDown = true;
  await shutdown().catch(() => {});
  autoUpdater.quitAndInstall(false, true);
});

// ── Splash screen ───────────────────────────────────────────────────────────
function createSplash(): void {
  const splashPath = isDev
    ? path.join(__dirname, '../assets/splash.html')
    : path.join(process.resourcesPath, 'app', 'assets', 'splash.html');

  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.loadFile(splashPath, { query: { v: app.getVersion() } });
  splashWindow.on('closed', () => { splashWindow = null; });
}

function setSplashStatus(text: string): void {
  splashWindow?.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(text)}`)
    .catch(() => {});
}

// ── Comprobación de actualizaciones al arrancar ─────────────────────────────
// Se ejecuta ANTES de levantar postgres — si hay update y el usuario acepta,
// ni siquiera arrancamos la base de datos.
async function checkForUpdateOnStartup(): Promise<void> {
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

      // El splash tiene alwaysOnTop — desactivarlo mientras el diálogo está abierto
      splashWindow?.setAlwaysOnTop(false);
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Actualización disponible',
        message: `Nueva versión ${info.version} disponible`,
        detail: '¿Deseas descargar e instalar la actualización ahora?\nLa aplicación se reiniciará automáticamente.',
        buttons: ['Actualizar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
      });
      splashWindow?.setAlwaysOnTop(true);

      if (response === 0) {
        // Usuario acepta → descargar y reiniciar (sin arrancar postgres)
        setSplashStatus('Descargando actualización...');

        autoUpdater.on('download-progress', (p) => {
          setSplashStatus(`Descargando actualización... ${Math.round(p.percent)}%`);
        });

        autoUpdater.once('update-downloaded', async () => {
          setSplashStatus('Instalando...');
          // Parar postgres antes de que el instalador sustituya los binarios.
          // Marcar shuttingDown=true para que before-quit no interfiera y permita
          // que electron-updater complete su propio ciclo de quit → install → relaunch.
          shuttingDown = true;
          await shutdown().catch(() => {});
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
          mainWindow?.webContents.send('update-downloaded', { version: info.version });
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
function schedulePeriodicUpdateCheck(): void {
  if (isDev) return;

  setInterval(async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return;
      // Si hay versión nueva y aún no la teníamos, notificar a la ventana
      const newVersion = (result.updateInfo as { version: string }).version;
      if (newVersion && newVersion !== app.getVersion() && !pendingUpdateVersion) {
        pendingUpdateVersion = newVersion;
        mainWindow?.webContents.send('update-available', { version: newVersion });
        autoUpdater.downloadUpdate().catch(() => {});
      }
    } catch { /* silencioso */ }
  }, 60 * 60 * 1000);
}

// ── Ventana principal ───────────────────────────────────────────────────────
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'CryptoFolio',
    icon: isDev
      ? path.join(__dirname, '../assets/icon.png')
      : path.join(process.resourcesPath, 'app', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
    },
    backgroundColor: '#0f0f1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' https://api.binance.com wss://stream.binance.com:9443 https://api.coingecko.com",
            "frame-ancestors 'none'",
            "form-action 'self'",
          ].join('; '),
        ],
      },
    });
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? 'http://localhost:5173' : 'http://127.0.0.1:3001';
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadURL('http://127.0.0.1:3001');
  }

  mainWindow.once('ready-to-show', () => {
    splashWindow?.close();
    mainWindow?.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Startup ─────────────────────────────────────────────────────────────────
async function startup(): Promise<void> {
  console.log('[app] Iniciando CryptoFolio...');

  setSplashStatus('Iniciando base de datos...');
  console.log('[app] Arrancando PostgreSQL...');
  postgresManager = new PostgresManager();
  await postgresManager.start();
  console.log('[app] PostgreSQL listo.');

  setSplashStatus('Iniciando servidor...');
  console.log('[app] Arrancando backend...');
  backendManager = new BackendManager({
    databaseUrl: postgresManager.connectionString,
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

let shuttingDown = false;
let handlingStartupError = false;

async function shutdown(): Promise<void> {
  console.log('[app] Cerrando...');
  backendManager?.stop();
  await postgresManager?.stop();
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!isDev) Menu.setApplicationMenu(null);

  createSplash();

  try {
    // 1. Comprobar actualizaciones antes de levantar postgres
    setSplashStatus('Comprobando actualizaciones...');
    await checkForUpdateOnStartup();
    setSplashStatus('');

    // 2. Levantar postgres + backend
    await startup();

    // 3. Crear ventana principal
    await createWindow();

    // 4. Iniciar comprobaciones periódicas en segundo plano
    schedulePeriodicUpdateCheck();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? 'Error desconocido');
    console.error('[app] Error fatal en startup:', message);
    // Cerrar el splash ANTES del diálogo: el splash tiene alwaysOnTop y lo taparía.
    // El flag evita que window-all-closed dispare app.quit() mientras esperamos al usuario.
    handlingStartupError = true;
    splashWindow?.close();
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
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
