import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { DEFAULT_BACKEND_PORT } from './shared/ports';

/**
 * Crea la ventana principal. `onReadyToShow` se invoca justo antes de
 * mostrarla (el llamador lo usa para cerrar el splash primero) y `onClosed`
 * cuando el usuario la cierra (el llamador limpia su propia referencia).
 */
export async function createWindow(
  isDev: boolean,
  onReadyToShow: () => void,
  onClosed: () => void,
): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
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
    const allowed = isDev ? 'http://localhost:5173' : `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`;
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
    await mainWindow.loadURL(`http://127.0.0.1:${DEFAULT_BACKEND_PORT}`);
  }

  mainWindow.once('ready-to-show', () => {
    onReadyToShow();
    mainWindow.show();
  });

  mainWindow.on('closed', onClosed);

  return mainWindow;
}
