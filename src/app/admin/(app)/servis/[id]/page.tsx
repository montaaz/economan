import type { Metadata } from 'next'
import { ServiDetail } from '@/components/orders/servi-detail'

export const metadata: Metadata = { title: 'Servi complémentaire' }
export const dynamic = 'force-dynamic'

/** La fiche d'un servi, dans l'espace de l'administration : la garde est celle du layout. */
export default async function AdminServiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ServiDetail id={id} base="/admin" />
}
