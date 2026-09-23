'use client'

import { DEV_PASSWORD, devUsername } from '@/lib/dev-login'
import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Eye, EyeOff, LogIn } from 'lucide-react'
import { GlassCard, Button, Field } from '@/components/ui/glass'
import { loginStaff, type LoginState } from '@/server/auth/actions'
import { Logo } from '@/components/layout/logo'

export function StaffLogin({
  role, title, subtitle, accent,
}: {
  role: 'ADMIN' | 'ECONOMAN' | 'CONTROLEUR'
  title: string
  subtitle: string
  accent: string
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginStaff, {})
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>

      <GlassCard deep rim className="animate-rise">
        <form action={formAction} className="space-y-4 p-6 sm:p-7">
          <input type="hidden" name="role" value={role} />

          <div className="flex items-center gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-md"
              style={{ background: `linear-gradient(140deg, ${accent}, ${accent}bb)` }}
            >
              <LogIn className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.1rem] font-bold leading-tight tracking-tight text-fg">{title}</h1>
              <p className="mt-0.5 text-[0.82rem] text-fg-muted">{subtitle}</p>
            </div>
          </div>

          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
            >
              <AlertCircle className="mt-px size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <Field label="Identifiant" htmlFor="username" required>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              autoFocus
              placeholder={role === 'ADMIN' ? 'admin' : 'economat'}
              defaultValue={devUsername(role)}
              className="field"
            />
          </Field>

          <Field label="Mot de passe" htmlFor="password" required>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                defaultValue={DEV_PASSWORD}
                className="field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-fg-subtle transition-colors hover:text-fg"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          <SubmitButton />
        </form>
      </GlassCard>

      <Link
        href="/"
        className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.83rem] font-medium text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Retour à l’accueil
      </Link>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
      {!pending ? <LogIn className="size-4" /> : null}
      {pending ? 'Connexion…' : 'Se connecter'}
    </Button>
  )
}
