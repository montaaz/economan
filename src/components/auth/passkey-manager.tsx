'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { startRegistration } from '@simplewebauthn/browser'
import { Fingerprint, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { GlassCard, CardHeader, Button, Badge, EmptyState } from '@/components/ui/glass'
import { useToast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/graphql-client'
import { formatDateTime } from '@/lib/utils'

export type Passkey = {
  id: number
  deviceLabel: string | null
  createdAt: string
  lastUsedAt: string | null
}

export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [supported, setSupported] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    // Le capteur n'existe que dans un contexte sécurisé (HTTPS ou localhost).
    setSupported(typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext)
  }, [])

  const enroll = async () => {
    setBusy(true)
    try {
      const optRes = await fetch('/api/webauthn/register/options', { method: 'POST' })
      const options = await optRes.json()
      if (!optRes.ok) throw new Error(options.error ?? 'Enrôlement indisponible.')

      const attestation = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/webauthn/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...attestation, deviceLabel: deviceLabel() }),
      })
      const result = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(result.error ?? 'Empreinte non enregistrée.')

      push('success', 'Empreinte enregistrée — vous pourrez vous connecter d’un doigt.')
      router.refresh()
    } catch (e) {
      const msg = errorMessage(e)
      if (!/NotAllowed|abort/i.test(msg)) push('error', msg)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/webauthn/credentials/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Suppression impossible.')
      push('success', 'Empreinte supprimée.')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard>
      <CardHeader
        title="Connexion par empreinte"
        description="Enregistrez ce téléphone pour vous connecter avec votre empreinte digitale ou votre visage."
        icon={<Fingerprint className="size-5" />}
        action={
          supported === false ? null : (
            <Button variant="primary" loading={busy} onClick={enroll}>
              {!busy ? <Fingerprint className="size-4" /> : null}
              Ajouter cet appareil
            </Button>
          )
        }
      />

      {supported === false ? (
        <div className="flex items-start gap-2.5 border-b border-[rgb(var(--glass-edge)/0.16)] bg-warn/[0.08] px-4 py-3 sm:px-5">
          <AlertTriangle className="mt-px size-4 shrink-0 text-warn" />
          <p className="text-[0.82rem] leading-relaxed text-fg-muted">
            Cet appareil ou ce navigateur ne gère pas l’empreinte digitale. Elle exige une connexion
            sécurisée (HTTPS) et un capteur biométrique.
          </p>
        </div>
      ) : null}

      {passkeys.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-6" />}
          title="Aucun appareil enregistré"
          description="Vous vous connectez pour l’instant avec votre mot de passe."
        />
      ) : (
        <ul className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ok/12 text-ok">
                <Fingerprint className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.88rem] font-medium text-fg">
                  {p.deviceLabel ?? 'Appareil enregistré'}
                </p>
                <p className="truncate text-[0.75rem] text-fg-subtle">
                  Ajouté le {formatDateTime(p.createdAt)}
                  {p.lastUsedAt ? ` · dernier usage ${formatDateTime(p.lastUsedAt)}` : ''}
                </p>
              </div>
              {p.lastUsedAt ? <Badge tone="ok">Actif</Badge> : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Supprimer cette empreinte"
                disabled={busy}
                onClick={() => remove(p.id)}
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

/** Étiquette lisible déduite du navigateur, pour distinguer les appareils. */
function deviceLabel(): string {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac/i.test(ua)
        ? 'Mac'
        : /Windows/i.test(ua)
          ? 'Windows'
          : 'Appareil'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Navigateur'
  return `${os} · ${browser}`
}
