'use client'

import * as React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; tone: ToastTone; message: string }

const ToastContext = React.createContext<{
  push: (tone: ToastTone, message: string) => void
} | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}

const ICONS: Record<ToastTone, React.ElementType> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const TONES: Record<ToastTone, string> = {
  success: 'border-ok/35 text-ok',
  error: 'border-danger/35 text-danger',
  info: 'border-accent/35 text-accent',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const nextId = React.useRef(0)

  const remove = React.useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = React.useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++
      setToasts((list) => [...list, { id, tone, message }])
      // Les erreurs restent ; les succès s'effacent vite.
      window.setTimeout(() => remove(id), tone === 'error' ? 7000 : 4000)
    },
    [remove],
  )

  const value = React.useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end sm:px-0"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <div
              key={t.id}
              className={cn(
                'animate-rise glass glass-specular pointer-events-auto flex w-full max-w-sm items-start gap-2.5 border p-3 pr-2 shadow-lg',
                TONES[t.tone],
              )}
            >
              <Icon className="mt-px size-[1.05rem] shrink-0" />
              <p className="min-w-0 flex-1 text-[0.84rem] font-medium leading-snug text-fg">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                aria-label="Fermer"
                className="grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.2)] hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
