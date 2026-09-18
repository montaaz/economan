import { requireRole } from '@/server/auth/guards'
import { AppShell } from '@/components/layout/shell'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm'

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
        </AppShell>
      </ConfirmProvider>
    </ToastProvider>
  )
}
