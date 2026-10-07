import type { Metadata } from 'next'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { ScheduleManager } from '@/components/schedule/schedule-manager'
import { chargerDebutJournee } from '@/server/day-start'
import { businessDay, formatLongDate } from '@/lib/utils'
import { DayStartCard } from './day-start-card'

export const metadata: Metadata = { title: 'Horaires des commandes' }
export const dynamic = 'force-dynamic'

/**
 * L'horaire des commandes — de quelle heure à quelle heure les départements
 * peuvent commander. Il change avec la saison : l'administration le règle
 * ici, pour tous et, au besoin, utilisateur par utilisateur.
 */
export default async function HorairesPage() {
  await requireRole(['ADMIN'], '/admin/login')
  const debut = await chargerDebutJournee()
  return (
    <>
      <PageHeader
        title="Horaires des commandes"
        description="Les heures pendant lesquelles les départements peuvent commander : pour tous, ou pour chaque utilisateur. Ramadan, été : changez-les ici."
      />
      <DayStartCard initial={debut} journee={formatLongDate(businessDay())} />
      <ScheduleManager />
    </>
  )
}
