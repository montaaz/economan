import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { ajouterPhotos, PAR_ENVOI_MAX } from '@/server/services/invoice-photos'
import { WorkflowError } from '@/server/services/orders'
import { factureVerrouillee, FACTURE_VERROUILLEE } from '@/server/services/stock'

export const dynamic = 'force-dynamic'

/**
 * Reçoit les photos d'une facture : `supplierId`, `reference`, `day`, puis
 * pour chaque photo `image`, `vignette`, `largeur`, `hauteur`, dans le même
 * ordre. Économat et administration.
 */
export async function POST(request: Request) {
  const user = await readSession()
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  if (user.role !== 'ECONOMAN' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Envoi illisible.' }, { status: 400 }) }
  const jour = String(form.get('day') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return NextResponse.json({ error: 'Journée invalide.' }, { status: 400 })
  const fournisseur = String(form.get('supplierId') ?? '')
  let supplierId = fournisseur ? Number(fournisseur) : null
  if (supplierId !== null && !Number.isInteger(supplierId)) return NextResponse.json({ error: 'Fournisseur invalide.' }, { status: 400 })
  // Une facture qu'on vient d'enregistrer : on la retrouve par le nom de
  // son fournisseur, que l'écran connaît.
  const nom = String(form.get('supplierName') ?? '').trim()
  if (supplierId === null && nom) {
    const f = await prisma.supplier.findFirst({ where: { name: { equals: nom, mode: 'insensitive' } }, select: { id: true } })
    supplierId = f?.id ?? null
  }
  const reference = String(form.get('reference') ?? '').trim().slice(0, 80) || null

  const images = form.getAll('image'), vignettes = form.getAll('vignette')
  const largeurs = form.getAll('largeur'), hauteurs = form.getAll('hauteur')
  if (images.length === 0 || images.length !== vignettes.length) return NextResponse.json({ error: 'Photos incomplètes.' }, { status: 400 })
  if (images.length > PAR_ENVOI_MAX) return NextResponse.json({ error: `Au plus ${PAR_ENVOI_MAX} photos par envoi.` }, { status: 400 })
  const fichiers = images.map((image, i) => ({
    image: image as File, vignette: vignettes[i] as File,
    width: Number(largeurs[i] ?? 0) || 0, height: Number(hauteurs[i] ?? 0) || 0,
  }))
  if (fichiers.some((f) => !(f.image instanceof File) || !(f.vignette instanceof File))) return NextResponse.json({ error: 'Photos illisibles.' }, { status: 400 })

  const cle = { supplierId, reference, businessDay: new Date(`${jour}T00:00:00.000Z`) }
  // Une facture verrouillée ne prend plus de photos : on la déverrouille d'abord.
  if (await factureVerrouillee(cle)) return NextResponse.json({ error: FACTURE_VERROUILLEE }, { status: 403 })
  try {
    const n = await ajouterPhotos(cle, fichiers, user.id)
    return NextResponse.json({ count: n })
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
