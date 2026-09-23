'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Édition en place, ouverte au double-clic.
 *
 * Le simple clic est réservé : sur une ligne de tableau il sert à sélectionner
 * du texte, et ouvrir un champ à chaque clic rendrait la lecture pénible. Le
 * double-clic est le geste attendu pour « je veux changer ça ».
 *
 * Entrée valide, Échap annule, et perdre le focus valide aussi : abandonner
 * une saisie parce qu'on a cliqué ailleurs est la frustration classique de ce
 * type de champ.
 *
 * La valeur n'est envoyée que si elle a changé — un double-clic suivi d'un
 * Entrée ne doit rien écrire.
 */
export function InlineEdit({
  value, onSave, className, inputClassName, title, ariaLabel, validate, align = 'left', display,
}: {
  value: string
  /** Ce qu'on montre au repos, quand la valeur brute ne se lit pas telle quelle (unité, signe, tiret si vide). */
  display?: React.ReactNode
  /** Renvoie un message d'erreur, ou rien si l'écriture a réussi. */
  onSave: (next: string) => Promise<string | void> | string | void
  className?: string
  inputClassName?: string
  title?: string
  ariaLabel: string
  /** Rejette une saisie avant tout appel réseau. */
  validate?: (next: string) => string | null
  align?: 'left' | 'right'
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // La valeur peut changer sous nos pieds (rechargement après enregistrement).
  React.useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  React.useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const close = () => {
    setEditing(false)
    setError(null)
    setDraft(value)
  }

  const commit = async () => {
    const next = draft.trim()
    if (next === value.trim()) return close()

    const invalide = validate?.(next)
    if (invalide) {
      setError(invalide)
      inputRef.current?.focus()
      return
    }

    setBusy(true)
    const message = await onSave(next)
    setBusy(false)

    if (typeof message === 'string' && message) {
      // On garde le champ ouvert : l'utilisateur doit pouvoir corriger sans
      // retaper depuis le début.
      setError(message)
      inputRef.current?.focus()
      return
    }
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onDoubleClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault()
            setEditing(true)
          }
        }}
        title={title ?? 'Double-cliquez pour modifier'}
        aria-label={`${ariaLabel} — double-cliquez pour modifier`}
        className={cn(
          'cursor-text rounded px-0.5 outline-none',
          'hover:bg-accent/[0.09] focus-visible:ring-2 focus-visible:ring-accent/40',
          className,
        )}
      >
        {display ?? value}
      </span>
    )
  }

  return (
    <span className="relative inline-block w-full">
      <input
        ref={inputRef}
        value={draft}
        disabled={busy}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
        onBlur={() => void commit()}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        className={cn(
          'field h-7 w-full px-1.5 py-0 text-[inherit]',
          align === 'right' && 'text-right',
          error && 'border-danger/60',
          busy && 'opacity-60',
          inputClassName,
        )}
      />
      {error ? (
        <span
          role="alert"
          className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap rounded-md border border-danger/30 bg-white px-1.5 py-0.5 text-[0.7rem] font-medium text-danger shadow-sm"
        >
          {error}
        </span>
      ) : null}
    </span>
  )
}
