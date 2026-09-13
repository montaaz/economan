import type { Metadata } from 'next'
import { AccountPage } from '@/components/auth/account-page'

export const metadata: Metadata = { title: 'Mon compte' }
export const dynamic = 'force-dynamic'

export default function EconomatAccountPage() {
  return <AccountPage loginPath="/economat/login" />
}
