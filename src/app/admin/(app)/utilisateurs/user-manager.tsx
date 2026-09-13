'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Eye, EyeOff, AlertCircle, Users, Fingerprint } from 'lucide-react'
import { GlassCard, Button, Badge, Field, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { cn, formatDateTime, initials } from '@/lib/utils'
import { ROLE_LABEL } from '@/lib/nav'
import { saveUser, toggleUser, deleteUser, type ActionResult } from '@/server/services/admin'
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
}

const ROLE_TONE = { EMPLOYEE: 'neutral', ECONOMAN: 'ok', ADMIN: 'accent' } as const

export function UserManager({
  users, departments,
}: {
  users: ManagedUser[]
  departments: { id: number; name: string }[]
}) {
  const router = useRouter()
  const { push } = useToast()
  const [editing, setEditing] = React.useState<ManagedUser | null | undefined>(undefined)

  const act = async (fn: () => Promise<ActionResult>, success: string) => {
    const r = await fn()
    if (r.ok) {
      push('success', success)
      router.refresh()
    } else {
      push('error', r.error ?? 'Action impossible.')
    }
  }

  return (
    <>
      <GlassCard>
        <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <p className="text-[0.85rem] tabular-nums text-fg-muted">
            {users.length} compte{users.length > 1 ? 's' : ''}
          </p>
          <Button variant="primary" size="sm" onClick={() => setEditing(null)}>
            <Plus className="size-4" />
            Nouvel utilisateur
          </Button>
        </div>

        {users.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Aucun utilisateur" />
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
              {users.map((u) => (
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
                      <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEditing(u)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => {
                          if (!confirm(`Supprimer le compte de ${u.fullName} ?`)) return
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

        <Field
          label={user ? 'Nouveau mot de passe' : 'Mot de passe'}
          htmlFor="u-password"
          required={!user}
          hint={user ? 'Laissez vide pour conserver le mot de passe actuel.' : '8 caractères minimum.'}
        >
          <input
            id="u-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className="field"
            required={!user}
          />
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
