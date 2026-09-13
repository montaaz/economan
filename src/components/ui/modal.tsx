'use client'

import * as React from 'react'
import { X } from 'lucide-react'

/** Feuille montante sur mobile, boîte centrée à partir de `sm`. */
export function Modal({
  title, onClose, children, footer,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button aria-label="Fermer" onClick={onClose} className="fixed inset-0 bg-[#0a1830]/45 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-deep glass-specular animate-rise relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-b-none sm:rounded-[calc(var(--radius)+4px)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] p-4 sm:p-5">
          <h2 className="text-[1rem] font-bold text-fg">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.16)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-[rgb(var(--glass-edge)/0.16)] p-4 sm:p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
