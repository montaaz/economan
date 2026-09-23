import type { Metadata } from 'next'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { Fiches } from '@/components/control/fiches'

export const metadata: Metadata = { title: 'Fiches techniques' }
export const dynamic = 'force-dynamic'

export default async function ControleFichesPage() {
  await requireRole(['CONTROLEUR', 'ADMIN'], '/controle/login')
  return (
    <>
      <PageHeader
        title="Fiches techniques"
        description="Ce que chaque plat de la carte consomme du stock, par portion. Le Z multiplie ces fiches par les ventes pour le contrôle des stocks."
      />
      <Fiches />
    </>
  )
}
