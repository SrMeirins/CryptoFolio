import { app, BrowserWindow } from 'electron';
import path from 'path';

let splashWindow: BrowserWindow | null = null;

export function createSplash(isDev: boolean): void {
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

export function setSplashStatus(text: string): void {
  splashWindow?.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(text)}`)
    .catch(() => {});
}

// El splash tiene alwaysOnTop — hay que desactivarlo mientras se muestra
// cualquier diálogo nativo (dialog.showMessageBox), o lo taparía.
export function setSplashAlwaysOnTop(value: boolean): void {
  splashWindow?.setAlwaysOnTop(value);
}

export function closeSplash(): void {
  splashWindow?.close();
}
