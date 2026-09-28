import type { Metadata } from 'next'
import { requireRole } from '@/server/auth/guards'
import { ServiDetail } from '@/components/orders/servi-detail'

export const metadata: Metadata = { title: 'Servi complémentaire' }
export const dynamic = 'force-dynamic'

export default async function ServiDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string }> }) {
  const { retour } = await searchParams
  await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  const { id } = await params
  return <ServiDetail id={id} base="/economat" retour={retour} />
}
