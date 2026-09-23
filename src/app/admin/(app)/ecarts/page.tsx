import type { Metadata } from 'next'
import { EcartsPage } from '@/components/orders/ecarts-page'

export const metadata: Metadata = { title: 'Écarts de la journée' }
export const dynamic = 'force-dynamic'

/**
 * Les écarts, dans l'espace de l'administration : elle y sert et corrige
 * comme l'économat, sous son propre nom. La garde est celle du layout.
 */
export default function AdminEcartsPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; jusquau?: string; dep?: string; type?: string }>
}) {
  return <EcartsPage searchParams={searchParams} base="/admin" />
}
