import type { Metadata } from 'next'
import { SuiteDetail } from '@/components/orders/suite-detail'

export const metadata: Metadata = { title: 'Suite de commande' }
export const dynamic = 'force-dynamic'

/** La suite d'une commande, dans l'espace de l'administration : la garde est celle du layout. */
export default async function AdminSuitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string }> }) {
  const { id } = await params
  const { retour } = await searchParams
  return <SuiteDetail orderId={id} base="/admin" retour={retour} />
}
