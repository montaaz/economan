import { requireRole } from '@/server/auth/guards'
import { AppShell } from '@/components/layout/shell'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm'

export default async function ControleLayout({ children }: { children: React.ReactNode }) {
  // L'administration entre aussi : elle doit pouvoir relire un Z sans
  // changer de compte.
  const user = await requireRole(['CONTROLEUR', 'ADMIN'], '/controle/login')
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
        </AppShell>
      </ConfirmProvider>
    </ToastProvider>
  )
}
