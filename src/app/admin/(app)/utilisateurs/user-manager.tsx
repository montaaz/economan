'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Eye, EyeOff, AlertCircle, Users, Fingerprint, Shield, ScanFace, Copy, Check, Wand2 } from 'lucide-react'
import { FaceEnrollModal } from '@/components/auth/face-enroll'
import { Icon } from '@/components/ui/icon'
import { GlassCard, Button, Badge, Field, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { cn, formatDateTime, initials } from '@/lib/utils'
import { ROLE_LABEL } from '@/lib/nav'
import { saveUser, toggleUser, deleteUser, revealPassword, type ActionResult } from '@/server/services/admin'
import type { Role } from '@/generated/prisma/enums'

export type ManagedUser = {
  id: number
  fullName: string
  username: string
  role: Role
  isActive: boolean
  avatarColor: string
  lastLoginAt: string | null
  departmentId: number | null
  department: { name: string; color: string } | null
  _count: { credentials: number; ordersCreated: number }
  /** Le visage enregistré, pour la connexion par la caméra. */
  faceProfile: { updatedAt: Date | string } | null
}

const ROLE_TONE = { EMPLOYEE: 'neutral', ECONOMAN: 'ok', CONTROLEUR: 'info', ADMIN: 'accent' } as const

export function UserManager({
  users, departments,
}: {
  users: ManagedUser[]
  departments: { id: number; name: string; color: string; icon: string | null }[]
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [editing, setEditing] = React.useState<ManagedUser | null | undefined>(undefined)
  const [visage, setVisage] = React.useState<ManagedUser | null>(null)

  // Département filtré. 'sans' regroupe les comptes qui n'en ont pas —
  // économat et administration — qu'aucun onglet de service ne montrerait.
  const [filtre, setFiltre] = React.useState<number | 'sans' | null>(null)

  const visibles = React.useMemo(() => {
    if (filtre === null) return users
    if (filtre === 'sans') return users.filter((u) => u.departmentId === null)
    return users.filter((u) => u.departmentId === filtre)
  }, [users, filtre])

  // Compteurs par département, pour que chaque bouton annonce son effectif.
  const parDept = React.useMemo(() => {
    const m = new Map<number | 'sans', number>()
    for (const u of users) {
      const k = u.departmentId ?? 'sans'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [users])

  const act = async (fn: () => Promise<ActionResult>, success: string) => {
    const r = await fn()
    if (r.ok) {
      push('success', success)
      router.refresh()
    } else {
      push('error', r.error ?? 'Action impossible.')
    }
  }

  const sansDept = parDept.get('sans') ?? 0

  return (
    <>
      {/* Filtre par département, même geste que sur le tableau de bord. */}
      <div className="scroll-x -mx-1 mb-4 flex gap-2 px-1 pb-1">
        <FiltreBouton
          on={filtre === null}
          onClick={() => setFiltre(null)}
          count={users.length}
        >
          Tous
        </FiltreBouton>

        {departments.map((d) => {
          const n = parDept.get(d.id) ?? 0
          return (
            <FiltreBouton
              key={d.id}
              on={filtre === d.id}
              onClick={() => setFiltre(d.id)}
              count={n}
              // Un département sans agent reste cliquable : constater qu'il
              // n'en a aucun est précisément ce qu'on vient vérifier ici.
              dim={n === 0}
              icon={
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-lg text-white"
                  style={{ background: d.color }}
                >
                  <Icon name={d.icon ?? 'Building2'} className="size-3.5" />
                </span>
              }
            >
              {d.name}
            </FiltreBouton>
          )
        })}

        {/* Économat et administration n'ont pas de département : sans cet
            onglet, « Tous » serait le seul endroit où les voir. */}
        {sansDept > 0 ? (
          <FiltreBouton
            on={filtre === 'sans'}
            onClick={() => setFiltre('sans')}
            count={sansDept}
            icon={
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[rgb(var(--glass-edge)/0.28)] text-fg-muted">
                <Shield className="size-3.5" />
              </span>
            }
          >
            Sans département
          </FiltreBouton>
        ) : null}
      </div>

      <GlassCard>
        <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <p className="text-[0.85rem] tabular-nums text-fg-muted">
            {visibles.length} compte{visibles.length > 1 ? 's' : ''}
            {filtre !== null ? (
              <span className="text-fg-subtle"> sur {users.length}</span>
            ) : null}
          </p>
          <Button variant="primary" size="sm" onClick={() => setEditing(null)}>
            <Plus className="size-4" />
            Nouvel utilisateur
          </Button>
        </div>

        {visibles.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="Aucun utilisateur"
            description={
              filtre !== null
                ? 'Aucun compte n’est rattaché à ce département.'
                : undefined
            }
          />
        ) : (
          <TableWrap minWidth="44rem">
            <thead>
              <tr>
                <Th className="w-full">Utilisateur</Th>
                <Th>Rôle</Th>
                <Th>Département</Th>
                <Th className="text-right">Commandes</Th>
                <Th>Dernière connexion</Th>
                <Th>État</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {visibles.map((u) => (
                <tr key={u.id} className={cn(!u.isActive && 'opacity-55')}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-white shadow-sm"
                        style={{ background: `linear-gradient(140deg, ${u.avatarColor}, ${u.avatarColor}bb)` }}
                      >
                        {initials(u.fullName)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-[0.88rem] font-medium text-fg">
                          {u.fullName}
                          {u._count.credentials > 0 ? (
                            <Fingerprint className="size-3.5 shrink-0 text-ok" aria-label="Empreinte enregistrée" />
                          ) : null}
                          {u.faceProfile ? (
                            <ScanFace className="size-3.5 shrink-0 text-ok" aria-label="Visage enregistré" />
                          ) : null}
                        </span>
                        <span className="block truncate font-mono text-[0.72rem] text-fg-subtle">
                          {u.username}
                        </span>
                      </span>
                    </div>
                  </Td>
                  <Td><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge></Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {u.department ? (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: u.department.color }} />
                        {u.department.name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-right tabular-nums text-fg-muted">{u._count.ordersCreated}</Td>
                  <Td className="whitespace-nowrap text-[0.8rem] text-fg-subtle">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Jamais'}
                  </Td>
                  <Td>{u.isActive ? <Badge tone="ok">Actif</Badge> : <Badge tone="neutral">Désactivé</Badge>}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={u.isActive ? 'Désactiver' : 'Activer'}
                        onClick={() =>
                          act(
                            () => toggleUser(u.id, !u.isActive),
                            u.isActive ? 'Compte désactivé.' : 'Compte activé.',
                          )
                        }
                      >
                        {u.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Visage de ${u.fullName}`}
                          title={u.faceProfile ? 'Visage enregistré : le refaire ou le retirer' : 'Enregistrer son visage'}
                          className={u.faceProfile ? 'text-ok' : undefined}
                          onClick={() => setVisage(u)}>
                          <ScanFace className="size-4" />
                        </Button>
                      <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEditing(u)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer"
                        className="text-danger hover:bg-danger/10"
                        onClick={async () => {
                          const ok = await confirmer({
                            title: 'Supprimer le compte',
                            message: (
                              <p>
                                Vous êtes sûr de supprimer le compte de{' '}
                                <strong className="text-fg">{u.fullName}</strong> ?
                              </p>
                            ),
                          })
                          if (!ok) return
                          act(() => deleteUser(u.id), 'Compte supprimé.')
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </GlassCard>

      {visage ? (
        <FaceEnrollModal user={{ id: visage.id, fullName: visage.fullName }}
          enregistreLe={visage.faceProfile ? new Date(visage.faceProfile.updatedAt).toISOString() : null}
          onClose={() => setVisage(null)} />
      ) : null}
      {editing !== undefined ? (
        <UserForm
          user={editing}
          departments={departments}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            push('success', 'Utilisateur enregistré.')
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function UserForm({
  user, departments, onClose, onSaved,
}: {
  user: ManagedUser | null
  departments: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(saveUser, { ok: false })
  const [role, setRole] = React.useState<Role>(user?.role ?? 'EMPLOYEE')

  React.useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  return (
    <Modal title={user ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        {user ? <input type="hidden" name="id" value={user.id} /> : null}

        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Field label="Nom complet" htmlFor="u-name" required>
          <input
            id="u-name"
            name="fullName"
            defaultValue={user?.fullName}
            placeholder="Karim Mejri"
            className="field"
            autoFocus
            required
          />
        </Field>

        <Field label="Identifiant" htmlFor="u-username" required hint="Minuscules, chiffres, . _ -">
          <input
            id="u-username"
            name="username"
            defaultValue={user?.username}
            placeholder="bar"
            className="field lowercase"
            required
          />
        </Field>

        <Field label="Rôle" htmlFor="u-role" required>
          <select
            id="u-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="field"
          >
            <option value="EMPLOYEE">Employé — passe les commandes</option>
            <option value="ECONOMAN">Économat — sert les commandes</option>
            <option value="CONTROLEUR">Contrôle de gestion — saisit le Z, consulte les stocks</option>
            <option value="ADMIN">Administrateur — pilotage complet</option>
          </select>
        </Field>

        {role === 'EMPLOYEE' ? (
          <Field label="Département" htmlFor="u-dept" required>
            <select
              id="u-dept"
              name="departmentId"
              defaultValue={user?.departmentId ?? ''}
              className="field"
              required
            >
              <option value="">— Choisir —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
        ) : null}

        {user ? <CurrentPassword userId={Number(user.id)} /> : null}

        <Field
          label={user ? 'Nouveau mot de passe' : 'Mot de passe'}
          htmlFor="u-password"
          required={!user}
          hint={user
            ? 'Laissez vide pour garder le mot de passe actuel.'
            : '8 caractères minimum. « Générer » en crée un solide, à copier pour l’utilisateur.'}
        >
          <PasswordField required={!user} />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" loading={pending}>
      Enregistrer
    </Button>
  )
}

/** Bouton d'onglet du filtre : même dessin que la barre du tableau de bord. */
function FiltreBouton({
  on, onClick, count, children, icon, dim,
}: {
  on: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
  icon?: React.ReactNode
  /** Grisé quand l'onglet ne contient aucun compte. */
  dim?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[0.85rem] font-medium transition-colors sm:text-[0.83rem]',
        on
          ? 'border-accent/45 bg-accent/12 text-accent'
          : 'border-[rgb(var(--glass-edge)/0.28)] bg-white/50 text-fg-muted hover:bg-white/80',
        dim && !on && 'opacity-55',
      )}
    >
      {icon}
      {children}
      <span className="tabular-nums opacity-70">({count})</span>
    </button>
  )
}

/** Lettres et chiffres sans ambiguïté (ni 0/O, ni 1/l/I) : il se dicte et se recopie sans erreur. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genererMotDePasse(n = 10) {
  const r = new Uint32Array(n)
  crypto.getRandomValues(r)
  return Array.from(r, (x) => ALPHABET[x % ALPHABET.length]).join('')
}

/** Copie un texte. Hors HTTPS (adresse du réseau local), le presse-papiers moderne est refusé : l'ancienne méthode passe partout. */
async function copierTexte(texte: string) {
  try {
    await navigator.clipboard.writeText(texte)
  } catch {
    const t = document.createElement('textarea')
    t.value = texte; t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select()
    document.execCommand('copy'); t.remove()
  }
}

/**
 * Le mot de passe actuel d'un compte, pour l'administration : masqué, un œil
 * pour le voir, « Copier ». Il n'est connu qu'une fois fixé par
 * l'administration, ou après la prochaine connexion de l'utilisateur.
 */
function CurrentPassword({ userId }: { userId: number }) {
  const [valeur, setValeur] = React.useState<string | null | undefined>(undefined)
  const [visible, setVisible] = React.useState(false)
  const [copie, setCopie] = React.useState(false)

  React.useEffect(() => {
    let vivant = true
    revealPassword(userId).then((r) => { if (vivant) setValeur(r.ok ? r.password : null) }).catch(() => { if (vivant) setValeur(null) })
    return () => { vivant = false }
  }, [userId])

  const connu = typeof valeur === 'string'
  return (
    <div className="rounded-xl border border-[rgb(var(--glass-edge)/0.28)] bg-white/55 p-3">
      <p className="mb-1.5 text-[0.8rem] font-semibold text-fg-muted">Mot de passe actuel</p>
      {valeur === undefined ? (
        <p className="text-[0.82rem] text-fg-subtle">Chargement…</p>
      ) : connu ? (
        <div className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate rounded-lg bg-white/80 px-3 py-2 font-mono text-[0.95rem] text-fg', !visible && 'tracking-[0.3em]')}>
            {visible ? valeur : '•'.repeat(Math.max(8, valeur.length))}
          </span>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Masquer le mot de passe actuel' : 'Afficher le mot de passe actuel'}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.16)] hover:text-fg"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          <button
            type="button"
            onClick={async () => { await copierTexte(valeur); setCopie(true); window.setTimeout(() => setCopie(false), 1800) }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[rgb(var(--glass-edge)/0.35)] bg-white/70 px-2.5 text-[0.78rem] font-semibold text-fg-muted transition-colors hover:text-fg"
          >
            {copie ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
            {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
      ) : (
        <p className="text-[0.8rem] leading-snug text-fg-subtle">
          Pas encore connu : il s’affichera après la prochaine connexion de cet utilisateur avec son mot de passe.
          Ou donnez-en un nouveau ci-dessous (« Générer », « Copier », « Enregistrer »).
        </p>
      )}
    </div>
  )
}

/** Le nouveau mot de passe : un œil pour le voir, « Copier », « Générer ». */
function PasswordField({ required }: { required: boolean }) {
  const [valeur, setValeur] = React.useState('')
  const [visible, setVisible] = React.useState(false)
  const [copie, setCopie] = React.useState(false)

  const copier = async () => {
    if (!valeur) return
    await copierTexte(valeur)
    // Le bouton dit « Copié » : une fenêtre à fermer serait de trop pour un copier.
    setCopie(true)
    window.setTimeout(() => setCopie(false), 1800)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          id="u-password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="••••••••"
          className={cn('field pr-11', visible && 'font-mono tracking-wide')}
          required={required}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          title={visible ? 'Masquer' : 'Afficher'}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.16)] hover:text-fg"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setValeur(genererMotDePasse()); setVisible(true) }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 text-[0.78rem] font-semibold text-accent transition-colors hover:bg-accent/15"
        >
          <Wand2 className="size-3.5" /> Générer
        </button>
        <button
          type="button"
          onClick={() => void copier()}
          disabled={!valeur}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[rgb(var(--glass-edge)/0.35)] bg-white/70 px-2.5 text-[0.78rem] font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          {copie ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  )
}

