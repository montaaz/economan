'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Eye, EyeOff, AlertCircle, Truck, Phone, Mail, MapPin, User } from 'lucide-react'
import { GlassCard, Button, Badge, Field, EmptyState, TableWrap, Th, Td } from '@/components/ui/glass'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { correspond, normaliser } from '@/lib/search'
import { cn, formatDate, formatMoney } from '@/lib/utils'
import type { ActionResult } from '@/server/services/admin'
import { saveSupplier, toggleSupplier, deleteSupplier } from '@/server/services/suppliers-admin'

export type Fournisseur = {
  id: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  taxId: string | null
  commerceRegister: string | null
  bankAccount: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  /** Ce qu'on lui a acheté : factures, total hors taxes, dernière livraison. */
  factures: number
  achats: number
  derniere: string | null
  photos: number
}

export function SupplierManager({ fournisseurs }: { fournisseurs: Fournisseur[] }) {
  const router = useRouter()
  const { push } = useToast()
  const confirmer = useConfirm()
  const [edition, setEdition] = React.useState<Fournisseur | null | undefined>(undefined)
  const [recherche, setRecherche] = React.useState('')

  const requete = normaliser(recherche.trim())
  const vus = fournisseurs.filter((f) => correspond(requete, f.name, f.contactName, f.phone, f.email, f.taxId, f.commerceRegister, f.address))
  const actifs = fournisseurs.filter((f) => f.isActive).length

  const agir = async (fn: () => Promise<ActionResult>, succes: string) => {
    const r = await fn()
    if (r.ok) { push('success', succes); router.refresh() } else push('error', r.error ?? 'Action impossible.')
  }

  return (
    <>
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--glass-edge)/0.16)] px-4 py-3 sm:px-5">
          <p className="text-[0.85rem] tabular-nums text-fg-muted">
            {fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''}
            {actifs < fournisseurs.length ? ` · ${fournisseurs.length - actifs} masqué${fournisseurs.length - actifs > 1 ? 's' : ''}` : ''}
          </p>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <SearchField value={recherche} onChange={setRecherche} placeholder="Nom, téléphone, MF…" className="min-w-0 flex-1 sm:w-64 sm:flex-none" />
            <Button variant="primary" size="sm" onClick={() => setEdition(null)}>
              <Plus className="size-4" />
              Nouveau fournisseur
            </Button>
          </div>
        </div>

        {fournisseurs.length === 0 ? (
          <EmptyState
            icon={<Truck className="size-6" />}
            title="Aucun fournisseur"
            description="Créez-en un ici, ou saisissez une facture : son fournisseur s’ajoute seul."
          />
        ) : vus.length === 0 ? (
          <EmptyState icon={<Truck className="size-6" />} title="Aucun résultat" description={`Aucun fournisseur ne correspond à « ${recherche} ».`} />
        ) : (
          <TableWrap minWidth="62rem">
            <thead>
              <tr>
                <Th className="w-full">Fournisseur</Th>
                <Th>Coordonnées</Th>
                <Th>MF · RC</Th>
                <Th className="text-right">Factures</Th>
                <Th className="text-right">Achats HT</Th>
                <Th>Dernière</Th>
                <Th>État</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--glass-edge)/0.12)]">
              {vus.map((f) => (
                <tr key={f.id} className={cn(!f.isActive && 'opacity-55')}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-sm">
                        <Truck className="size-[1.05rem]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9rem] font-semibold text-fg">{f.name}</span>
                        {f.contactName ? <span className="flex items-center gap-1 truncate text-[0.76rem] text-fg-muted"><User className="size-3" />{f.contactName}</span> : null}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-[0.8rem] text-fg-muted">
                    {f.phone ? <span className="flex items-center gap-1 whitespace-nowrap"><Phone className="size-3" />{f.phone}</span> : null}
                    {f.email ? <span className="flex items-center gap-1 whitespace-nowrap"><Mail className="size-3" />{f.email}</span> : null}
                    {f.address ? <span className="flex max-w-56 items-center gap-1 truncate"><MapPin className="size-3 shrink-0" />{f.address}</span> : null}
                    {!f.phone && !f.email && !f.address ? <span className="text-warn">À compléter</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-[0.78rem] text-fg-muted">
                    <span className="block">{f.taxId ?? '—'}</span>
                    {f.commerceRegister ? <span className="block">RC {f.commerceRegister}</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums text-fg">{f.factures}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums text-fg">{f.achats > 0 ? formatMoney(f.achats) : '—'}</Td>
                  <Td className="whitespace-nowrap text-[0.8rem] text-fg-muted">{f.derniere ? formatDate(f.derniere) : '—'}</Td>
                  <Td>{f.isActive ? <Badge tone="ok">Actif</Badge> : <Badge tone="neutral">Masqué</Badge>}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        aria-label={f.isActive ? `Masquer ${f.name}` : `Réafficher ${f.name}`}
                        title={f.isActive ? 'Masquer : il ne se propose plus sur les factures' : 'Réafficher sur les factures'}
                        onClick={() => agir(() => toggleSupplier(f.id, !f.isActive), f.isActive ? 'Fournisseur masqué.' : 'Fournisseur réaffiché.')}
                      >
                        {f.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Modifier ${f.name}`} onClick={() => setEdition(f)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" aria-label={`Supprimer ${f.name}`}
                        className="text-danger hover:bg-danger/10"
                        onClick={async () => {
                          if (f.factures > 0 || f.photos > 0) {
                            push('error', `${f.name} porte ${f.factures} facture${f.factures > 1 ? 's' : ''}${f.photos > 0 ? ` et ${f.photos} photo${f.photos > 1 ? 's' : ''}` : ''} : il ne peut pas être supprimé. Masquez-le plutôt.`)
                            return
                          }
                          const ok = await confirmer({
                            title: 'Supprimer le fournisseur',
                            message: <p>Vous êtes sûr de supprimer le fournisseur <strong className="text-fg">{f.name}</strong> ?</p>,
                            confirmLabel: 'Supprimer', tone: 'danger',
                          })
                          if (!ok) return
                          agir(() => deleteSupplier(f.id), 'Fournisseur supprimé.')
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

      {edition !== undefined ? (
        <SupplierForm
          fournisseur={edition}
          onClose={() => setEdition(undefined)}
          onSaved={() => {
            setEdition(undefined)
            push('success', 'Fournisseur enregistré.')
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function SupplierForm({ fournisseur: f, onClose, onSaved }: { fournisseur: Fournisseur | null; onClose: () => void; onSaved: () => void }) {
  const [etat, action, envoi] = useActionState<ActionResult, FormData>(saveSupplier, { ok: false })
  React.useEffect(() => { if (etat.ok) onSaved() }, [etat, onSaved])

  return (
    <Modal title={f ? `Modifier ${f.name}` : 'Nouveau fournisseur'} onClose={onClose} wide>
      {/* Envoyé à la main : un refus (nom en double, RIB invalide) laisse la
          saisie en place, là où `action=` viderait le formulaire. */}
      <form
        id="fournisseur-form"
        onSubmit={(e) => {
          e.preventDefault()
          const donnees = new FormData(e.currentTarget)
          React.startTransition(() => action(donnees))
        }}
        className="space-y-4"
      >
        {f ? <input type="hidden" name="id" value={f.id} /> : null}
        {etat.error ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[0.83rem] font-medium text-danger">
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{etat.error}</span>
          </div>
        ) : null}

        <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-fg-muted">Société</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom de la société" htmlFor="f-name" required className="sm:col-span-2"
            hint="Le nom tel qu’il figure sur les factures : c’est par lui qu’elles s’y rattachent.">
            <input id="f-name" name="name" defaultValue={f?.name} placeholder="Only Fresh by KFA" className="field" autoFocus required maxLength={120} />
          </Field>
          <Field label="Personne à contacter" htmlFor="f-contact">
            <input id="f-contact" name="contactName" defaultValue={f?.contactName ?? ''} placeholder="Nom du commercial" className="field" maxLength={120} />
          </Field>
          <Field label="Téléphone" htmlFor="f-phone">
            <input id="f-phone" name="phone" type="tel" defaultValue={f?.phone ?? ''} placeholder="71 000 000" className="field" maxLength={40} />
          </Field>
          <Field label="E-mail" htmlFor="f-email">
            <input id="f-email" name="email" type="email" defaultValue={f?.email ?? ''} placeholder="contact@societe.tn" className="field" maxLength={160} />
          </Field>
          <Field label="Adresse" htmlFor="f-address">
            <input id="f-address" name="address" defaultValue={f?.address ?? ''} placeholder="Rue, ville" className="field" maxLength={300} />
          </Field>
        </div>

        <p className="pt-1 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-fg-muted">Administratif</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Matricule fiscal (MF)" htmlFor="f-tax">
            <input id="f-tax" name="taxId" defaultValue={f?.taxId ?? ''} placeholder="1234567/A/M/000" className="field font-mono" maxLength={40} />
          </Field>
          <Field label="Registre de commerce (RC)" htmlFor="f-rc">
            <input id="f-rc" name="commerceRegister" defaultValue={f?.commerceRegister ?? ''} placeholder="B0123456789" className="field font-mono" maxLength={40} />
          </Field>
          <Field label="RIB" htmlFor="f-rib">
            <input id="f-rib" name="bankAccount" defaultValue={f?.bankAccount ?? ''} placeholder="20 chiffres" inputMode="numeric" className="field font-mono" maxLength={40} />
          </Field>
        </div>

        <Field label="Remarques" htmlFor="f-notes" hint="Jours de livraison, conditions de paiement…">
          <textarea id="f-notes" name="notes" defaultValue={f?.notes ?? ''} rows={3} className="field min-h-20 py-2" maxLength={1000} />
        </Field>
        {f ? (
          <p className="text-[0.78rem] text-fg-muted">
            Créé le {formatDate(f.createdAt)} · {f.factures} facture{f.factures > 1 ? 's' : ''}
            {f.achats > 0 ? ` · ${formatMoney(f.achats)} HT achetés` : ''}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" loading={envoi}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  )
}
