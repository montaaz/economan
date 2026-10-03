import type { Metadata } from 'next'
import { executeGraphQL } from '@/server/graphql/execute'
import { PageHeader } from '@/components/ui/stat'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { businessDay, formatLongDate } from '@/lib/utils'
import { LiveClock } from '@/components/ui/live-clock'
import { Clock, Lock } from 'lucide-react'
import { fenetreDe } from '@/server/services/schedule'
import { GlassCard } from '@/components/ui/glass'
import { BackLink } from '@/components/ui/back-link'
import { NewOrderForm, type CatalogProduct } from './new-order-form'

export const metadata: Metadata = { title: 'Nouvelle commande' }
export const dynamic = 'force-dynamic'

const QUERY = /* GraphQL */ `
  query Catalog {
    myCatalog {
      id
      name
      reference
      stockFixe
      category { id name icon }
      baseUnit { id symbol allowsDecimals }
    }
  }
`

export default async function NewOrderPage() {
  const user = await requireEmployeeDepartment()
  // L'horaire des commandes : hors de sa plage, on le dit tout de suite
  // plutôt que de laisser remplir cent lignes qui seront refusées.
  const fenetre = await fenetreDe(user.id)
  if (!fenetre.open) {
    return (
      <>
        <BackLink href="/employe">Retour</BackLink>
        <PageHeader title="Nouvelle commande" />
        <GlassCard className="mx-auto max-w-xl p-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger/12 text-danger"><Lock className="size-7" /></span>
          <p className="mt-3 text-[1.15rem] font-bold text-fg">Les commandes sont fermées</p>
          <p className="mt-2 text-[0.95rem] text-fg-muted">
            Vous pouvez commander de <strong className="text-fg">{fenetre.opensAt}</strong> à <strong className="text-fg">{fenetre.closesAt}</strong>
            {fenetre.label ? <> — horaire {fenetre.label}</> : null}.
          </p>
          <p className="mt-1 text-[0.95rem] text-fg-muted">Il est <strong className="tabular-nums text-fg">{fenetre.now}</strong>.</p>
          <p className="mt-3 text-[0.82rem] text-fg-subtle">Pour un besoin qui ne peut pas attendre, demandez une commande urgente à l’administration.</p>
        </GlassCard>
      </>
    )
  }
  const data = await executeGraphQL<{ myCatalog: CatalogProduct[] }>(QUERY)

  return (
    <>
      {/* La date accompagne le titre plutôt que le cartouche de la feuille :
          c'est la première chose à vérifier avant de saisir. */}
      <PageHeader
        title="Nouvelle commande"
        actions={
          <p className="flex items-baseline gap-2.5 text-[1.15rem] font-bold tabular-nums text-fg sm:text-[1.3rem]">
            <span className="capitalize">{formatLongDate(businessDay())}</span>
            <LiveClock />
          </p>
        }
      />
      {fenetre.restricted ? (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ok/12 px-3 py-1 text-[0.82rem] font-semibold text-ok">
          <Clock className="size-4" />
          Commandes ouvertes jusqu’à {fenetre.closesAt}{fenetre.label ? ` — horaire ${fenetre.label}` : ''}
        </p>
      ) : null}
      <NewOrderForm
        products={data.myCatalog}
        departmentName={user.departmentName ?? '—'}
        userName={user.fullName}
        businessDay={businessDay().toISOString()}
      />
    </>
  )
}
