import { create } from 'zustand'
import { DEFAULT_TIMEZONE, setCurrentTimezone } from '../constants/timezone'

// Zona horaria efectiva en el frontend (#390). Cambiarla vuelve a pintar las
// páginas (RoutedContent se suscribe), que formatean con la zona nueva.

interface TimezoneState {
  tz: string
  setTz: (tz: string) => void
}

export const useTimezoneStore = create<TimezoneState>(set => ({
  tz: DEFAULT_TIMEZONE,
  setTz: tz => {
    setCurrentTimezone(tz)
    set({ tz })
  },
}))
