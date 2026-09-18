'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Eye, EyeOff, AlertCircle, Building2 } from 'lucide-react'
import { GlassCard, Button, Badge, Field, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/lib/utils'
import { saveDepartment, toggleDepartment, deleteDepartment, type ActionResult } from '@/server/services/admin'

export type Dept = {
  id: number
  name: string
  code: string
  color: string
  icon: string | null
  isActive: boolean
  _count: { users: number; orders: number; categories: number }
}

const COLORS = ['#3b82f6', '#ef4444', '#ec4899', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#6366f1']
const ICONS = [
  'Martini', 'ChefHat', 'CakeSlice', 'UtensilsCrossed', 'SprayCan', 'Coffee',
  'Sandwich', 'Croissant', 'Wine', 'Building2', 'Store', 'Bed',
]

export function DepartmentManager({ departments }: { departments: Dept[] }) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [editing, setEditing] = React.useState<Dept | null | undefined>(undefined)

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
            {departments.length} département{departments.length > 1 ? 's' : ''}
          </p>
          <Button variant="primary" size="sm" onClick={() => setEditing(null)}>
            <Plus className="size-4" />
            Nouveau département
          </Button>
        </div>

        {departments.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="Aucun département"
            description="Créez le premier service qui passera commande."
          />
        ) : (
          <TableWrap minWidth="40rem">
            <thead>
              <tr>
                <Th className="w-full">Département</Th>
                <Th>Code</Th>
                <Th className="text-right">Catégories</Th>
                <Th className="text-right">Agents</Th>
                <Th className="text-right">Commandes</Th>
                <Th>État</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {departments.map((d) => (
                <tr key={d.id} className={cn(!d.isActive && 'opacity-55')}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                        style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}bb)` }}
                      >
                        <Icon name={d.icon ?? 'Building2'} className="size-[1.05rem]" />
                      </span>
                      <span className="truncate text-[0.88rem] font-medium text-fg">{d.name}</span>
                    </div>
                  </Td>
                  <Td className="font-mono text-[0.8rem] text-fg-muted">{d.code}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{d._count.categories}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{d._count.users}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{d._count.orders}</Td>
                  <Td>
                    {d.isActive ? <Badge tone="ok">Actif</Badge> : <Badge tone="neutral">Masqué</Badge>}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={d.isActive ? 'Masquer' : 'Afficher'}
                        title={d.isActive ? 'Masquer de la page d’accueil' : 'Afficher sur la page d’accueil'}
                        onClick={() =>
                          act(
                            () => toggleDepartment(d.id, !d.isActive),
                            d.isActive ? 'Département masqué.' : 'Département affiché.',
                          )
                        }
                      >
                        {d.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEditing(d)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer"
                        className="text-danger hover:bg-danger/10"
                        onClick={async () => {
                          const ok = await confirmer({
                            title: 'Supprimer le département',
                            message: (
                              <p>
                                Vous êtes sûr de supprimer le département{' '}
                                <strong className="text-fg">{d.name}</strong> ?
                              </p>
                            ),
                          })
                          if (!ok) return
                          act(() => deleteDepartment(d.id), 'Département supprimé.')
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
        <DepartmentForm
          department={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            push('success', 'Département enregistré.')
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function DepartmentForm({
  department, onClose, onSaved,
}: {
  department: Dept | null
  onClose: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(saveDepartment, { ok: false })
  const [color, setColor] = React.useState(department?.color ?? COLORS[0])
  const [icon, setIcon] = React.useState(department?.icon ?? 'Building2')

  React.useEffect(() => {
    if (state.ok) onSaved()
  }, [state.ok, onSaved])

  return (
    <Modal title={department ? 'Modifier le département' : 'Nouveau département'} onClose={onClose}>
      <form id="dept-form" action={formAction} className="space-y-4">
        {department ? <input type="hidden" name="id" value={department.id} /> : null}
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="icon" value={icon} />

        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Field label="Nom" htmlFor="d-name" required>
          <input
            id="d-name"
            name="name"
            defaultValue={department?.name}
            placeholder="Fast food"
            className="field"
            autoFocus
            required
          />
        </Field>

        <Field label="Code" htmlFor="d-code" required hint="2 à 6 caractères, utilisé dans les références.">
          <input
            id="d-code"
            name="code"
            defaultValue={department?.code}
            placeholder="FFD"
            className="field uppercase"
            required
          />
        </Field>

        <Field label="Couleur">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Couleur ${c}`}
                aria-pressed={color === c}
                className={cn(
                  'size-8 rounded-lg border-2 transition-transform',
                  color === c ? 'scale-110 border-fg' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>

        <Field label="Icône">
          <div className="grid grid-cols-6 gap-1.5">
            {ICONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setIcon(n)}
                aria-label={n}
                aria-pressed={icon === n}
                className={cn(
                  'grid aspect-square place-items-center rounded-lg border transition-colors',
                  icon === n
                    ? 'border-accent/45 bg-accent/12 text-accent'
                    : 'border-[rgb(var(--glass-edge)/0.28)] text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)]',
                )}
              >
                <Icon name={n} className="size-[1.05rem]" />
              </button>
            ))}
          </div>
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
