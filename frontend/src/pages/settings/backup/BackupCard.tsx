import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { backupApi } from '../../../api/backup'
import { SettingsCard } from '../SettingsCard'
import { BackupExport } from './BackupExport'
import { BackupRestore } from './BackupRestore'
import { PreviousState } from './PreviousState'

// Copias de seguridad en Datos (#453): exportar, restaurar y, si se ha
// restaurado alguna, volver al estado de antes.
export function BackupCard({ index = 0 }: { index?: number }) {
  const { data: snapshots = [] } = useQuery({ queryKey: ['backup-snapshots'], queryFn: backupApi.snapshots })
  return (
    <SettingsCard index={index} icon={ShieldCheck} title="Copias de seguridad"
      description="Todo lo que no se puede recalcular: operaciones, filas originales de los CSV, wallets y direcciones, activos, ajustes y datos fiscales. Las cachés de precios, los lotes FIFO y las claves de API no se incluyen.">
      <BackupExport />
      <div className="pt-4 border-t border-border/50">
        <BackupRestore />
      </div>
      {snapshots[0] && <PreviousState snapshot={snapshots[0]} />}
    </SettingsCard>
  )
}
