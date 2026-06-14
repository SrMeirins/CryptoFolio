import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { PostgresManager } from './postgres-manager';
import { BackendManager } from './backend-manager';

const isDev = process.env.NODE_ENV === 'development';

// Evitar crash cuando stdout/stderr se cierra (ej: al pipear a `head`)
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

let mainWindow: BrowserWindow | null = null;
let postgresManager: PostgresManager;
let backendManager: BackendManager;

// ── Seguridad: un solo proceso ──────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── Configuración de autoUpdater ────────────────────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message);
  });

  if (!isDev) {
    // Comprobar actualizaciones al arrancar y cada hora
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
  }
}

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

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
      contextIsolation: true,   // El renderer NO puede acceder a Node.js
      nodeIntegration: false,   // Nunca activar esto
      sandbox: true,            // Sandbox del proceso renderer
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Bloquear navegación a URLs externas desde el renderer
      navigateOnDragDrop: false,
    },
    backgroundColor: '#0f0f1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false, // No mostrar hasta que esté lista
  });

  // CSP adicional para el renderer (sobre el que ya aplica el backend)
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
            // 'self' cubre http://127.0.0.1:3001 porque el frontend se sirve desde ahí
            "connect-src 'self' https://api.binance.com wss://stream.binance.com:9443 https://api.coingecko.com",
            "frame-ancestors 'none'",
            "form-action 'self'",
          ].join('; '),
        ],
      },
    });
  });

  // Bloquear navegación fuera de la app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? 'http://localhost:5173' : 'http://127.0.0.1:3001';
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Abrir links target="_blank" en el browser del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Frontend servido por el backend Express → mismo origen, sin CORS
    await mainWindow.loadURL('http://127.0.0.1:3001');
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Startup y shutdown ──────────────────────────────────────────────────────
async function startup(): Promise<void> {
  console.log('[app] Iniciando CryptoFolio...');

  // 1. PostgreSQL embebido
  console.log('[app] Arrancando PostgreSQL...');
  postgresManager = new PostgresManager();
  await postgresManager.start();
  console.log('[app] PostgreSQL listo.');

  // 2. Backend Express (corre migraciones en su propio startup)
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

  // 3. Ventana
  await createWindow();

  // 4. Auto-updater (no bloquea el startup)
  setupAutoUpdater();
}

async function shutdown(): Promise<void> {
  console.log('[app] Cerrando...');
  backendManager?.stop();
  await postgresManager?.stop();
}

// ── Ciclo de vida de Electron ───────────────────────────────────────────────
app.whenReady().then(async () => {
  // Quitar menú nativo en producción (la UI tiene el suyo)
  if (!isDev) Menu.setApplicationMenu(null);

  try {
    await startup();
  } catch (err) {
    const message = (err as Error).message;
    console.error('[app] Error fatal en startup:', message);
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
  // En macOS la app sigue activa aunque se cierren todas las ventanas
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  await shutdown();
});
