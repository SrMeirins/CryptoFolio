interface ElectronBridge {
  apiUrl:     string
  wsUrl:      string
  isElectron: boolean
  openExternal: (url: string) => void
  getUpdateStatus: () => Promise<{ available: boolean; downloaded: boolean; version: string | null }>
  downloadAndInstall: () => Promise<void>
  onUpdateAvailable: (cb: (info: { version: string }) => void) => void
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => void
}

interface Window {
  __CRYPTOFOLIO__?: ElectronBridge
}
