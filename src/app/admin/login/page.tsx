import type { Metadata } from 'next'
import { StaffLogin } from '@/components/auth/staff-login'

export const metadata: Metadata = { title: 'Connexion administrateur' }

export default function AdminLoginPage() {
  return (
    <StaffLogin
      role="ADMIN"
      title="Espace administrateur"
      subtitle="Pilotage et configuration."
      accent="#1c4f96"
    />
  )
}
