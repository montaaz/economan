import type { Metadata } from 'next'
import { requireRole } from '@/server/auth/guards'
import { PageHeader } from '@/components/ui/stat'
import { FicheArticles } from '@/components/stock/fiche-articles'

export const metadata: Metadata = { title: 'Fiche articles' }
export const dynamic = 'force-dynamic'

/**
 * Les fiches d'articles — chaque article pur, et ce qu'on en prépare avec sa
 * composition. Réservé à l'économat et à l'administration : c'est le réglage
 * que la préparation et la livraison lisent ensuite.
 */
export default async function EconomatFicheArticlesPage() {
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  return (
    <>
      <PageHeader
        title="Fiche articles"
        description="Toutes les familles du catalogue et leurs articles : départements, stock fixe, et la composition des articles préparés."
      />
      <FicheArticles />
    </>
  )
}
