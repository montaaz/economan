'use client'

import { DEV_PASSWORD } from '@/lib/dev-login'
import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'
import { AlertCircle, ArrowLeft, Eye, EyeOff, Fingerprint, LogIn } from 'lucide-react'
import { GlassCard, Button, Field } from '@/components/ui/glass'
import { loginEmployee, type LoginState } from '@/server/auth/actions'
import { cn, initials } from '@/lib/utils'

type U = {
  id: number
  fullName: string
  username: string
  avatarColor: string
  hasPasskey: boolean
}

export function DepartmentLogin({ users }: { users: U[] }) {
  const [selected, setSelected] = React.useState<U | null>(users.length === 1 ? users[0] : null)

  if (!selected) {
    return (
      <div className="animate-rise grid grid-cols-2 gap-3">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelected(u)}
            className="glass glass-specular glass-hover flex flex-col items-center gap-2.5 p-4 text-center"
          >
            <span
              className="grid size-14 place-items-center rounded-full text-[1rem] font-bold text-white shadow-md"
              style={{ background: `linear-gradient(140deg, ${u.avatarColor}, ${u.avatarColor}bb)` }}
            >
              {initials(u.fullName)}
            </span>
            <span className="w-full truncate text-[0.85rem] font-semibold leading-tight text-fg">
              {u.fullName}
            </span>
            {u.hasPasskey ? (
              <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-accent">
                <Fingerprint className="size-3.5" />
                Empreinte
              </span>
            ) : null}
          </button>
        ))}
      </div>
    )
  }

  return (
    <LoginForm
      user={selected}
      onBack={users.length > 1 ? () => setSelected(null) : undefined}
    />
  )
}

function LoginForm({ user, onBack }: { user: U; onBack?: () => void }) {
  const router = useRouter()
  const [state, formAction] = useActionState<LoginState, FormData>(loginEmployee, {})
  const [showPassword, setShowPassword] = React.useState(false)
  const [bioError, setBioError] = React.useState<string | null>(null)
  const [bioBusy, setBioBusy] = React.useState(false)

  const signInWithFingerprint = async () => {
    setBioError(null)
    setBioBusy(true)
    try {
      const optRes = await fetch('/api/webauthn/login/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const options = await optRes.json()
      if (!optRes.ok) throw new Error(options.error ?? 'Empreinte indisponible.')

      const assertion = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/webauthn/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, response: assertion }),
      })
      const result = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(result.error ?? 'Empreinte refusée.')

      router.push(result.redirect ?? '/employe')
      router.refresh()
    } catch (e) {
      // L'utilisateur qui annule le prompt système n'a pas besoin d'une alerte.
      const msg = e instanceof Error ? e.message : 'Empreinte refusée.'
      setBioError(/NotAllowed|abort/i.test(msg) ? null : msg)
    } finally {
      setBioBusy(false)
    }
  }

  return (
    <GlassCard deep rim className="animate-rise">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              onClick={onBack}
              aria-label="Changer d’utilisateur"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.16)] hover:text-fg"
            >
              <ArrowLeft className="size-4" />
            </button>
          ) : null}
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full text-[0.9rem] font-bold text-white shadow-md"
            style={{ background: `linear-gradient(140deg, ${user.avatarColor}, ${user.avatarColor}bb)` }}
          >
            {initials(user.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[1rem] font-bold leading-tight text-fg">{user.fullName}</p>
            <p className="truncate font-mono text-[0.75rem] text-fg-subtle">{user.username}</p>
          </div>
        </div>

        {user.hasPasskey ? (
          <>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              loading={bioBusy}
              onClick={signInWithFingerprint}
            >
              {!bioBusy ? <Fingerprint className="size-5" /> : null}
              {bioBusy ? 'Vérification…' : 'Se connecter par empreinte'}
            </Button>
            {bioError ? (
              <p role="alert" className="text-[0.78rem] font-medium text-danger">{bioError}</p>
            ) : null}
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[rgb(var(--glass-edge)/0.28)]" />
              <span className="text-[0.74rem] font-medium uppercase tracking-wide text-fg-subtle">ou</span>
              <span className="h-px flex-1 bg-[rgb(var(--glass-edge)/0.28)]" />
            </div>
          </>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={user.id} />

          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
            >
              <AlertCircle className="mt-px size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <Field label="Mot de passe" htmlFor="password" required>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                autoFocus={!user.hasPasskey}
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

          <SubmitButton hasPasskey={user.hasPasskey} />
        </form>
      </div>
    </GlassCard>
  )
}

function SubmitButton({ hasPasskey }: { hasPasskey: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={hasPasskey ? 'secondary' : 'primary'}
      size="lg"
      loading={pending}
      className={cn('w-full')}
    >
      {!pending ? <LogIn className="size-4" /> : null}
      {pending ? 'Connexion…' : 'Se connecter'}
    </Button>
  )
}
