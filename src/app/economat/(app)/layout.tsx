import { requireRole } from '@/server/auth/guards'
import { AppShell } from '@/components/layout/shell'
import { ToastProvider } from '@/components/ui/toast'

export default async function EconomatLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['ECONOMAN', 'ADMIN'], '/economat/login')
  return (
    <ToastProvider>
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
    </ToastProvider>
  )
}
