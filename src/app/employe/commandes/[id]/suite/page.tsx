import type { Metadata } from 'next'
import { requireEmployeeDepartment } from '@/server/auth/guards'
import { SuiteDetail } from '@/components/orders/suite-detail'

export const metadata: Metadata = { title: 'Suite de commande' }
export const dynamic = 'force-dynamic'

/** La suite d'une commande, vue du département : seulement la sienne. */
export default async function EmployeeSuitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string }> }) {
  const user = await requireEmployeeDepartment()
  const { id } = await params
  const { retour } = await searchParams
  return <SuiteDetail orderId={id} base="/employe" retour={retour} departmentId={user.departmentId} />
}
