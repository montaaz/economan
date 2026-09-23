import type { Metadata } from 'next'
import { EcartsPage } from '@/components/orders/ecarts-page'

export const metadata: Metadata = { title: 'Écarts de la journée' }
export const dynamic = 'force-dynamic'

export default function EconomatEcartsPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string; type?: string }>
}) {
  return <EcartsPage searchParams={searchParams} base="/economat" />
}
