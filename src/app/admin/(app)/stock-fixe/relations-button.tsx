'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Grid3x3, Check, ChevronRight, ChevronLeft, Search, Loader2 } from 'lucide-react'
import { Button, Badge, EmptyState } from '@/components/ui/glass'
import { Icon } from '@/components/ui/icon'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  getDepartmentRelations, toggleDepartmentCategory, toggleDepartmentProduct,
} from '@/server/services/admin'

export type DeptRef = { id: number; name: string; color: string; icon: string | null }

type ProductRel = { id: number; name: string; reference: string; symbol: string; onSheet: boolean }
type CategoryRel = { id: number; name: string; icon: string | null; linked: boolean; products: ProductRel[] }

export function RelationsButton({ departments }: { departments: DeptRef[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Grid3x3 className="size-3.5" />
        Affectations
      </Button>
      {open ? <RelationsPanel departments={departments} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function RelationsPanel({
  departments, onClose,
}: {
  departments: DeptRef[]
  onClose: () => void
}) {
  const router = useRouter()
  const { push } = useToast()

  const [deptId, setDeptId] = React.useState(departments[0]?.id ?? 0)
  const [rows, setRows] = React.useState<CategoryRel[] | null>(null)
  const [openCat, setOpenCat] = React.useState<number | null>(null)
  const [search, setSearch] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  // Sur téléphone les deux colonnes ne tiennent pas côte à côte : on montre
  // la liste des départements, puis celle des familles.
  const [mobileStep, setMobileStep] = React.useState<'dept' | 'fam'>('dept')

  const load = React.useCallback(async (id: number) => {
    setRows(null)
    setRows((await getDepartmentRelations(id)) as unknown as CategoryRel[])
  }, [])

  React.useEffect(() => {
    if (deptId) void load(deptId)
  }, [deptId, load])

  const dept = departments.find((d) => d.id === deptId)

  const visible = React.useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows
      .map((c) => ({
        ...c,
        products: c.products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.name.toLowerCase().includes(q) || c.products.length > 0)
  }, [rows, search])

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key)
    try {
      const r = await fn()
      if (!r.ok) {
        push('error', r.error ?? 'Action impossible.')
        return
      }
      await load(deptId)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const linkedCount = rows?.filter((c) => c.linked).length ?? 0
  const sheetCount = rows?.reduce((n, c) => n + c.products.filter((p) => p.onSheet).length, 0) ?? 0

  return (
    <Modal title="Affectations" onClose={onClose} wide>
      <div className="flex min-h-[26rem] gap-3">
        {/* Colonne gauche : les départements */}
        <div
          className={cn(
            'w-full shrink-0 sm:w-[13rem]',
            mobileStep === 'fam' ? 'hidden sm:block' : 'block',
          )}
        >
          <p className="mb-1.5 px-1 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">
            Départements
          </p>
          <ul className="space-y-1">
            {departments.map((d) => {
              const on = d.id === deptId
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDeptId(d.id)
                      setOpenCat(null)
                      setMobileStep('fam')
                    }}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
                      on
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-[rgb(var(--glass-edge)/0.26)] bg-white/40 hover:bg-white/70',
                    )}
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                      style={{ background: d.color }}
                    >
                      <Icon name={d.icon ?? 'Building2'} className="size-4" />
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate text-[0.83rem]', on ? 'font-semibold text-fg' : 'text-fg-muted')}>
                      {d.name}
                    </span>
                    <ChevronRight className={cn('size-4 shrink-0', on ? 'text-accent' : 'text-fg-subtle')} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Colonne droite : familles du département, et leurs articles */}
        <div className={cn('min-w-0 flex-1', mobileStep === 'dept' ? 'hidden sm:block' : 'block')}>
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileStep('dept')}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.16)] sm:hidden"
              aria-label="Retour aux départements"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9rem] font-bold text-fg">{dept?.name}</p>
              <p className="text-[0.72rem] tabular-nums text-fg-subtle">
                {linkedCount} famille(s) · {sheetCount} article(s) sur la feuille
              </p>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une famille ou un article…"
              className="field h-9 py-0 pl-9 text-[0.83rem]"
              aria-label="Rechercher"
            />
          </div>

          {rows === null ? (
            <p className="flex items-center gap-2 px-1 py-6 text-[0.83rem] text-fg-muted">
              <Loader2 className="size-4 animate-spin" />
              Chargement…
            </p>
          ) : visible.length === 0 ? (
            <EmptyState title="Aucun résultat" description="Modifiez votre recherche." />
          ) : (
            <ul className="max-h-[22rem] space-y-1 overflow-y-auto pr-1">
              {visible.map((c) => {
                const surFeuille = c.products.filter((p) => p.onSheet).length
                const ouvert = openCat === c.id
                return (
                  <li key={c.id}>
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-xl border pr-1 transition-colors',
                        c.linked
                          ? 'border-ok/40 bg-ok/[0.08]'
                          : 'border-[rgb(var(--glass-edge)/0.26)] bg-white/40',
                      )}
                    >
                      {/* Cocher la famille place tous ses articles sur la feuille. */}
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`cat-${c.id}`, () =>
                            toggleDepartmentCategory(deptId, c.id, !c.linked),
                          )
                        }
                        aria-pressed={c.linked}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left disabled:opacity-55"
                      >
                        <span
                          className={cn(
                            'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                            c.linked ? 'border-ok bg-ok text-white' : 'border-[rgb(var(--glass-edge)/0.4)]',
                          )}
                        >
                          {busy === `cat-${c.id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : c.linked ? (
                            <Check className="size-3.5" />
                          ) : null}
                        </span>
                        {c.icon ? (
                          <Icon
                            name={c.icon}
                            className={cn('size-4 shrink-0', c.linked ? 'text-ok' : 'text-fg-subtle')}
                          />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-[0.82rem] font-medium', c.linked ? 'text-fg' : 'text-fg-muted')}>
                            {c.name}
                          </span>
                          <span className="block text-[0.68rem] tabular-nums text-fg-subtle">
                            {surFeuille} / {c.products.length} article(s)
                          </span>
                        </span>
                      </button>

                      {c.products.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOpenCat(ouvert ? null : c.id)}
                          aria-expanded={ouvert}
                          aria-label={`Articles de ${c.name}`}
                          className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-[rgb(var(--glass-edge)/0.2)] hover:text-fg"
                        >
                          <ChevronRight className={cn('size-4 transition-transform', ouvert && 'rotate-90')} />
                        </button>
                      ) : (
                        <Badge tone="neutral" className="mr-1">vide</Badge>
                      )}
                    </div>

                    {/* Troisième niveau : les articles de la famille. */}
                    {ouvert ? (
                      <ul className="ml-4 mt-1 space-y-0.5 border-l border-[rgb(var(--glass-edge)/0.24)] pl-2">
                        {c.products.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                run(`prod-${p.id}`, () =>
                                  toggleDepartmentProduct(deptId, p.id, !p.onSheet),
                                )
                              }
                              aria-pressed={p.onSheet}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[rgb(var(--glass-edge)/0.12)] disabled:opacity-55"
                            >
                              <span
                                className={cn(
                                  'grid size-4 shrink-0 place-items-center rounded border transition-colors',
                                  p.onSheet ? 'border-accent bg-accent text-white' : 'border-[rgb(var(--glass-edge)/0.4)]',
                                )}
                              >
                                {busy === `prod-${p.id}` ? (
                                  <Loader2 className="size-2.5 animate-spin" />
                                ) : p.onSheet ? (
                                  <Check className="size-3" />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={cn('block truncate text-[0.78rem]', p.onSheet ? 'font-medium text-fg' : 'text-fg-muted')}>
                                  {p.name}
                                </span>
                                <span className="block truncate font-mono text-[0.66rem] text-fg-subtle">
                                  {p.reference} · {p.symbol}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <p className="mt-2 rounded-xl border border-[rgb(var(--glass-edge)/0.26)] bg-white/40 px-3 py-2 text-[0.75rem] leading-snug text-fg-muted">
            Cocher une famille met tous ses articles sur la feuille du département. Ouvrez-la
            pour n’en garder qu’une partie. Retirer le dernier article détache la famille.
          </p>
        </div>
      </div>
    </Modal>
  )
}
