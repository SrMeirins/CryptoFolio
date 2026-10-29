import { Palette, Coins } from 'lucide-react'
import { CurrencyToggle } from '../../components/CurrencyToggle'
import { ThemeSelector } from '../../components/ThemeSelector'
import { TimezoneSetting } from './TimezoneSetting'
import { PreferencesCard } from './PreferencesCard'
import { NotificationsCard } from './NotificationsCard'
import { AboutCard } from './AboutCard'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useSetTheme } from '../../hooks/useTheme'
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency'
import { THEME_LABELS } from '../../utils/theme'

export function GeneralSection() {
  // Guardado al momento con Deshacer (#445).
  const { saved, confirm } = useSettingFeedback()
  const setTheme = useSetTheme()
  const { setCurrency } = useDisplayCurrency()

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Tema (#197/#198) */}
      <SettingsCard index={0} icon={Palette} title="Tema" status={<SavedMark stamp={saved} id="tema" />}
        description="Oscuro, claro o el mismo que el sistema operativo. También puedes alternar entre claro y oscuro desde la barra superior."
        action={<ThemeSelector onChanged={(prev, next) => confirm('tema', `Tema ${THEME_LABELS[next].toLowerCase()}`, () => setTheme(prev))} />} />

      {/* Zona horaria (#390) */}
      <TimezoneSetting index={1} />

      {/* Moneda de visualización (#176) */}
      <SettingsCard index={2} icon={Coins} title="Moneda de visualización" status={<SavedMark stamp={saved} id="moneda" />}
        description={<>Moneda en la que se muestran precios, valores y P&amp;L. El dólar se toma del precio de USDT en cada fecha. La sección Fiscal se muestra siempre en EUR. También puedes cambiarla desde la barra superior.</>}
        action={<CurrencyToggle size="md" onChanged={(prev, next) => confirm('moneda', `Importes en ${next}`, () => setCurrency(prev))} />} />

      {/* Preferencias (#446) */}
      <PreferencesCard index={3} />

      {/* Notificaciones (#447): interruptores por categoría; la lista, en la campana */}
      <NotificationsCard index={4} />

      {/* Acerca de (#447) */}
      <AboutCard index={5} />

    </div>
  )
}
