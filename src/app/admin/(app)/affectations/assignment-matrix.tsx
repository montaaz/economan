'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Save, Check, RotateCcw } from 'lucide-react'
import { GlassCard, Button, Badge } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { setDepartmentCategories } from '@/server/services/admin'

type Dept = { id: number; name: string; code: string; color: string; icon: string | null }
type Cat = { id: number; name: string; icon: string | null; _count: { products: number } }

export function AssignmentMatrix({
  departments, categories, links,
}: {
  departments: Dept[]
  categories: Cat[]
  links: { departmentId: number; categoryId: number }[]
}) {
  const router = useRouter()
  const { push } = useToast()

  const initial = React.useMemo(() => {
    const map: Record<number, Set<number>> = {}
    for (const d of departments) map[d.id] = new Set()
    for (const l of links) map[l.departmentId]?.add(l.categoryId)
    return map
  }, [departments, links])

  const [state, setState] = React.useState<Record<number, Set<number>>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [Number(k), new Set(v)])),
  )
  const [saving, setSaving] = React.useState<number | null>(null)

  const toggle = (deptId: number, catId: number) =>
    setState((s) => {
      const next = new Set(s[deptId])
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return { ...s, [deptId]: next }
    })

  const setAll = (deptId: number, on: boolean) =>
    setState((s) => ({ ...s, [deptId]: on ? new Set(categories.map((c) => c.id)) : new Set() }))

  const isDirty = (deptId: number) => {
    const a = initial[deptId]
    const b = state[deptId]
    if (a.size !== b.size) return true
    for (const id of a) if (!b.has(id)) return true
    return false
  }

  const save = async (deptId: number) => {
    setSaving(deptId)
    try {
      const r = await setDepartmentCategories(deptId, [...state[deptId]])
      if (r.ok) {
        push('success', 'Affectations enregistrées.')
        router.refresh()
      } else {
        push('error', r.error ?? 'Enregistrement impossible.')
      }
    } finally {
      setSaving(null)
    }
  }

  /** Nombre d'articles visibles par le département, d'après les cases cochées. */
  const productCount = (deptId: number) =>
    categories.reduce((s, c) => (state[deptId].has(c.id) ? s + c._count.products : s), 0)

  return (
    <div className="space-y-4">
      {departments.map((d) => {
        const dirty = isDirty(d.id)
        const checked = state[d.id]
        return (
          <GlassCard key={d.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                  style={{ background: `linear-gradient(140deg, ${d.color}, ${d.color}bb)` }}
                >
                  <Icon name={d.icon ?? 'Building2'} className="size-[1.05rem]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[0.95rem] font-bold leading-tight text-fg">{d.name}</p>
                  <p className="text-[0.75rem] tabular-nums text-fg-subtle">
                    {checked.size} catégorie{checked.size > 1 ? 's' : ''} · {productCount(d.id)} articles
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {dirty ? <Badge tone="warn">Non enregistré</Badge> : null}
                <Button size="sm" variant="ghost" onClick={() => setAll(d.id, true)}>Tout</Button>
                <Button size="sm" variant="ghost" onClick={() => setAll(d.id, false)}>Aucun</Button>
                {dirty ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Annuler les modifications"
                    onClick={() => setState((s) => ({ ...s, [d.id]: new Set(initial[d.id]) }))}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={dirty ? 'primary' : 'secondary'}
                  disabled={!dirty}
                  loading={saving === d.id}
                  onClick={() => save(d.id)}
                >
                  {saving !== d.id ? <Save className="size-3.5" /> : null}
                  Enregistrer
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-4">
              {categories.map((c) => {
                const on = checked.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(d.id, c.id)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
                      on
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-[rgb(var(--glass-edge)/0.26)] bg-white/40 hover:bg-white/70',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                        on ? 'border-accent bg-accent text-white' : 'border-[rgb(var(--glass-edge)/0.4)]',
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                    {c.icon ? (
                      <Icon
                        name={c.icon}
                        className={cn('size-4 shrink-0', on ? 'text-accent' : 'text-fg-subtle')}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[0.8rem] font-medium', on ? 'text-fg' : 'text-fg-muted')}>
                        {c.name}
                      </span>
                      <span className="block text-[0.68rem] tabular-nums text-fg-subtle">
                        {c._count.products} article{c._count.products > 1 ? 's' : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </GlassCard>
        )
      })}
    </div>
  )
}
