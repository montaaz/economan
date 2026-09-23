import type { Metadata } from 'next'
import { ControlPage } from '@/components/control/control-page'

export const metadata: Metadata = { title: 'Contrôle des stocks' }
export const dynamic = 'force-dynamic'

/** Le même contrôle des stocks que le contrôleur, dans l'espace de l'administration. */
export default function AdminControlePage({ searchParams }: { searchParams: Promise<{ jour?: string; dep?: string }> }) {
  return <ControlPage searchParams={searchParams} base="/admin/controle" />
}
