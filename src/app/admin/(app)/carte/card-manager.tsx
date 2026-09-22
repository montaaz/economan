'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Receipt, FolderPlus } from 'lucide-react'
import { GlassCard, Button, Badge, Field, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { gql, errorMessage } from '@/lib/graphql-client'
import { formatQty, toNumber } from '@/lib/utils'

export type Dept = { id: string; name: string; color: string; icon: string | null }

export type CardFamily = {
  id: string
  name: string
  sortOrder: number
  itemCount: number
  items: {
    id: string
    name: string
    code: string | null
    price: number | null
    sortOrder: number
    department: { id: string; name: string; color: string } | null
  }[]
}

const CREATE_FAMILY = /* GraphQL */ `
  mutation CreateFamily($input: SalesFamilyInput!) {
    createSalesFamily(input: $input) { id }
  }
`
const UPDATE_FAMILY = /* GraphQL */ `
  mutation UpdateFamily($id: ID!, $input: SalesFamilyInput!) {
    updateSalesFamily(id: $id, input: $input) { id }
  }
`
const DELETE_FAMILY = /* GraphQL */ `
  mutation DeleteFamily($id: ID!) { deleteSalesFamily(id: $id) }
`
const CREATE_ITEM = /* GraphQL */ `
  mutation CreateItem($input: SalesItemInput!) {
    createSalesItem(input: $input) { id }
  }
`
const UPDATE_ITEM = /* GraphQL */ `
  mutation UpdateItem($id: ID!, $input: SalesItemInput!) {
    updateSalesItem(id: $id, input: $input) { id }
  }
`
const DELETE_ITEM = /* GraphQL */ `
  mutation DeleteItem($id: ID!) { deleteSalesItem(id: $id) }
`

type ItemDraft = {
  id: string | null
  familyId: string
  departmentId: string
  name: string
  code: string
  price: string
  sortOrder: string
}

/**
 * La carte de vente : familles et articles, tels qu'ils sortent sur le Z.
 *
 * C'est la nomenclature des ventes, distincte de celle de l'économat : on ne
 * vend pas ce qu'on stocke. Un café vendu consomme des grains, de l'eau et
 * une tasse ; confondre les deux listes rendrait l'une comme l'autre
 * illisible.
 */
export function CardManager({
  families, departments,
}: {
  families: CardFamily[]
  departments: Dept[]
}) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [busy, setBusy] = React.useState(false)
  const [famille, setFamille] = React.useState<CardFamily | null | undefined>(undefined)
  const [article, setArticle] = React.useState<ItemDraft | null>(null)

  const total = families.reduce((n, f) => n + f.itemCount, 0)

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await fn()
      push('success', success)
      setFamille(undefined)
      setArticle(null)
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const supprimerFamille = async (f: CardFamily) => {
    const ok = await confirmer({
      title: `Supprimer « ${f.name} » ?`,
      message: 'Cette famille disparaîtra de la carte.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    })
    if (!ok) return
    await run(() => gql(DELETE_FAMILY, { id: f.id }), 'Famille supprimée.')
  }

  const supprimerArticle = async (id: string, nom: string) => {
    const ok = await confirmer({
      title: `Retirer « ${nom} » de la carte ?`,
      message: 'S’il figure déjà sur un Z, il sera archivé plutôt qu’effacé : '
        + 'les recettes passées doivent rester lisibles.',
      confirmLabel: 'Retirer',
      tone: 'danger',
    })
    if (!ok) return
    await run(() => gql(DELETE_ITEM, { id }), 'Article retiré de la carte.')
  }

  return (
    <>
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <p className="text-[0.85rem] tabular-nums text-fg-muted">
            {families.length} famille{families.length > 1 ? 's' : ''} · {total} article{total > 1 ? 's' : ''}
          </p>
          <Button variant="primary" size="sm" onClick={() => setFamille(null)}>
            <FolderPlus className="size-4" />
            Nouvelle famille
          </Button>
        </div>

        {families.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6" />}
            title="La carte est vide"
            description="Créez une première famille — Pizzas, Boissons chaudes, Desserts — puis ses articles."
          />
        ) : null}
      </GlassCard>

      <div className="mt-4 space-y-4">
        {families.map((f) => (
          <GlassCard key={f.id} overflowVisible>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-bold text-fg">{f.name}</p>
                <p className="text-[0.8rem] tabular-nums text-fg-muted">
                  {f.itemCount} article{f.itemCount > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setArticle({
                    id: null, familyId: f.id, departmentId: '', name: '', code: '', price: '', sortOrder: '0',
                  })}
                >
                  <Plus className="size-3.5" />
                  Ajouter un article
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFamille(f)}>
                  <Pencil className="size-3.5" />
                  Renommer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void supprimerFamille(f)}>
                  <Trash2 className="size-3.5" />
                  Supprimer
                </Button>
              </div>
            </div>

            {f.items.length === 0 ? (
              <p className="px-4 py-5 text-center text-[0.85rem] text-fg-muted">
                Aucun article dans cette famille.
              </p>
            ) : (
              <TableWrap minWidth="34rem">
                <thead>
                  <tr>
                    <Th className="w-10 text-right">#</Th>
                    <Th className="w-full">Article</Th>
                    <Th>Service</Th>
                    <Th>Code caisse</Th>
                    <Th className="text-right">Prix</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
                  {f.items.map((i, k) => (
                    <tr key={i.id}>
                      <Td className="text-right text-[0.78rem] tabular-nums text-fg-subtle">{k + 1}</Td>
                      <Td className="text-[0.85rem] font-medium text-fg">{i.name}</Td>
                      <Td className="whitespace-nowrap">
                        {i.department ? (
                          <span className="inline-flex items-center gap-1.5 text-[0.8rem] text-fg-muted">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: i.department.color }}
                            />
                            {i.department.name}
                          </span>
                        ) : (
                          <span className="text-[0.8rem] text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td className="font-mono text-[0.75rem] text-fg-subtle">
                        {i.code ?? <span className="text-fg-subtle">—</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-right tabular-nums text-fg-muted">
                        {i.price === null ? '—' : formatQty(i.price, 3)}
                      </Td>
                      <Td className="text-right">
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setArticle({
                              id: i.id,
                              familyId: f.id,
                              departmentId: i.department?.id ?? '',
                              name: i.name,
                              code: i.code ?? '',
                              price: i.price === null ? '' : String(i.price),
                              sortOrder: String(i.sortOrder),
                            })}
                            aria-label={`Modifier ${i.name}`}
                            className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-[rgb(var(--glass-edge)/0.16)] hover:text-fg"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void supprimerArticle(i.id, i.name)}
                            aria-label={`Retirer ${i.name}`}
                            className="grid size-8 place-items-center rounded-lg text-danger transition-colors hover:bg-danger/15"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </GlassCard>
        ))}
      </div>

      {/* Famille : créer ou renommer */}
      {famille !== undefined ? (
        <Modal
          onClose={() => setFamille(undefined)}
          title={famille ? 'Renommer la famille' : 'Nouvelle famille'}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const input = {
                name: String(fd.get('name') ?? ''),
                sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
              }
              void run(
                () => famille
                  ? gql(UPDATE_FAMILY, { id: famille.id, input })
                  : gql(CREATE_FAMILY, { input }),
                famille ? 'Famille modifiée.' : 'Famille créée.',
              )
            }}
          >
            <Field label="Nom" htmlFor="f-name" required>
              <input
                id="f-name"
                name="name"
                defaultValue={famille?.name ?? ''}
                required
                maxLength={80}
                placeholder="Pizzas, Boissons chaudes…"
                className="field"
              />
            </Field>
            <Field label="Ordre d’affichage" htmlFor="f-order">
              <input
                id="f-order"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={famille?.sortOrder ?? 0}
                className="field"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setFamille(undefined)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {famille ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Article : créer ou modifier */}
      {article ? (
        <Modal
          onClose={() => setArticle(null)}
          title={article.id ? 'Modifier l’article' : 'Nouvel article'}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const prix = String(fd.get('price') ?? '').trim()
              const input = {
                familyId: article.familyId,
                departmentId: String(fd.get('departmentId') ?? '') || null,
                name: String(fd.get('name') ?? ''),
                code: String(fd.get('code') ?? '') || null,
                price: prix === '' ? null : toNumber(prix),
                sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
              }
              void run(
                () => article.id
                  ? gql(UPDATE_ITEM, { id: article.id, input })
                  : gql(CREATE_ITEM, { input }),
                article.id ? 'Article modifié.' : 'Article ajouté à la carte.',
              )
            }}
          >
            <Field label="Nom" htmlFor="i-name" required>
              <input
                id="i-name"
                name="name"
                defaultValue={article.name}
                required
                maxLength={120}
                placeholder="Pizza Margherita, Café express…"
                className="field"
              />
            </Field>
            <Field label="Service" htmlFor="i-dep">
              <select
                id="i-dep"
                name="departmentId"
                defaultValue={article.departmentId}
                className="field"
              >
                <option value="">Aucun service</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Code caisse" htmlFor="i-code">
              <input
                id="i-code"
                name="code"
                defaultValue={article.code}
                maxLength={40}
                placeholder="Facultatif — sert à relire un Z importé"
                className="field font-mono"
              />
            </Field>
            <Field label="Prix de vente" htmlFor="i-price">
              <input
                id="i-price"
                name="price"
                inputMode="decimal"
                defaultValue={article.price}
                placeholder="Facultatif"
                className="field text-right tabular-nums"
              />
            </Field>
            <Field label="Ordre d’affichage" htmlFor="i-order">
              <input
                id="i-order"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={article.sortOrder}
                className="field"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setArticle(null)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {article.id ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
