import type { Metadata } from 'next'
import { StaffLogin } from '@/components/auth/staff-login'

export const metadata: Metadata = { title: 'Connexion économat' }

export default function EconomatLoginPage() {
  return (
    <StaffLogin
      role="ECONOMAN"
      title="Espace économat"
      subtitle="Réception et traitement des commandes."
      accent="#0f9b6c"
    />
  )
}
