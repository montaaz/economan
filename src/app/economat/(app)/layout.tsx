import { requireRole } from '@/server/auth/guards'
import { AppShell } from '@/components/layout/shell'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm'
import { AnnonceCommandes } from '@/components/orders/annonce-commandes'
import { NotificationsEconomat } from '@/components/orders/notifications-economat'

export default async function EconomatLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell
          user={{
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            departmentName: user.departmentName,
          }}
        >
          {children}
          {/* L'annonce sonore des commandes en attente : l'économat seulement. */}
          {user.role === 'ECONOMAN' ? <><AnnonceCommandes /><NotificationsEconomat /></> : null}
        </AppShell>
      </ConfirmProvider>
    </ToastProvider>
  )
}
