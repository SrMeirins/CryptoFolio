// Ruta a la que navega cada tipo de aviso del sistema al hacer click
// (App.tsx: panel de campana; pages/settings/GeneralSection.tsx: pestaña de avisos).
export const NOTIFICATION_ROUTES: Record<string, string> = {
  'no-price':            '/settings?tab=assets',
  'lots-no-price':       '/settings?tab=assets',
  'pending-withdrawals': '/history',
  'crypto-deposits':     '/import',
}
