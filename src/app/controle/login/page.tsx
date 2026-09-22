import type { Metadata } from 'next'
import { StaffLogin } from '@/components/auth/staff-login'

export const metadata: Metadata = { title: 'Connexion contrôle de gestion' }

export default function ControleLoginPage() {
  return (
    <StaffLogin
      role="CONTROLEUR"
      title="Contrôle de gestion"
      subtitle="Note Z de la caisse et contrôle des stocks."
      accent="#7c4dff"
    />
  )
}
