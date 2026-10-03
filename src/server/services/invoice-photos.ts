import 'server-only'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink, readFile, stat } from 'node:fs/promises'
import { prisma } from '@/server/db'
import { WorkflowError } from './orders'
import { factureVerrouillee, FACTURE_VERROUILLEE } from './stock'

/**
 * Les photos des factures.
 *
 * Les images vont sur le disque, rangées par année et mois
 * (`factures/2026/09/<uuid>.jpg`) : un dossier ne dépasse jamais quelques
 * milliers de fichiers, et la base ne garde que leurs coordonnées. Le
 * dossier se règle par STORAGE_DIR ; sur le serveur, il se sauvegarde avec
 * la base.
 *
 * Chaque photo arrive déjà compressée par le téléphone, avec sa vignette :
 * le serveur n'a qu'à écrire deux fichiers.
 */

const RACINE = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), 'storage'))
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
/** Une photo compressée pèse quelques centaines de Ko ; au-delà, c'est qu'elle ne l'a pas été. */
export const TAILLE_MAX = 8 * 1024 * 1024
export const PAR_ENVOI_MAX = 20

/** Un chemin relatif, ramené au dossier de stockage — jamais au-dehors. */
function absolu(relatif: string): string {
  const p = path.resolve(RACINE, relatif)
  if (!p.startsWith(RACINE + path.sep)) throw new Error('Chemin hors du stockage.')
  return p
}

export type FactureCle = { supplierId: number | null; reference: string | null; businessDay: Date }

/** Enregistre des photos pour une facture. `fichiers` : l'image et sa vignette, deux à deux. */
export async function ajouterPhotos(cle: FactureCle, fichiers: { image: File; vignette: File; width: number; height: number }[], actorId: number) {
  if (fichiers.length === 0) throw new WorkflowError('Aucune photo reçue.')
  if (fichiers.length > PAR_ENVOI_MAX) throw new WorkflowError(`Au plus ${PAR_ENVOI_MAX} photos par envoi.`)
  for (const f of fichiers) {
    if (!TYPES[f.image.type] || !TYPES[f.vignette.type]) throw new WorkflowError('Seules les images JPEG, PNG ou WebP sont acceptées.')
    if (f.image.size > TAILLE_MAX || f.vignette.size > TAILLE_MAX) throw new WorkflowError('Photo trop lourde.')
  }
  if (cle.supplierId !== null) {
    const f = await prisma.supplier.findUnique({ where: { id: cle.supplierId }, select: { id: true } })
    if (!f) throw new WorkflowError('Fournisseur introuvable.')
  }
  const d = cle.businessDay
  const dossier = path.join('factures', String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'))
  await mkdir(path.join(RACINE, dossier), { recursive: true })

  const ecrits: string[] = []
  try {
    const lignes = []
    for (const f of fichiers) {
      const id = randomUUID()
      const image = path.join(dossier, `${id}.${TYPES[f.image.type]}`)
      const vignette = path.join(dossier, `${id}.mini.${TYPES[f.vignette.type]}`)
      await writeFile(absolu(image), Buffer.from(await f.image.arrayBuffer())); ecrits.push(image)
      await writeFile(absolu(vignette), Buffer.from(await f.vignette.arrayBuffer())); ecrits.push(vignette)
      lignes.push({
        supplierId: cle.supplierId, reference: cle.reference, businessDay: cle.businessDay,
        path: image, thumbPath: vignette, mime: f.image.type, size: f.image.size,
        width: Math.max(0, Math.round(f.width)), height: Math.max(0, Math.round(f.height)), createdById: actorId,
      })
    }
    await prisma.invoicePhoto.createMany({ data: lignes })
    return lignes.length
  } catch (e) {
    // Rien à moitié : un fichier écrit sans sa ligne en base serait perdu.
    await Promise.all(ecrits.map((r) => unlink(absolu(r)).catch(() => undefined)))
    throw e
  }
}

/** Les photos des factures d'une période, sans leurs fichiers. */
export async function photosDePeriode(from: Date, to: Date) {
  return prisma.invoicePhoto.findMany({
    where: { businessDay: { gte: from, lte: to } },
    orderBy: { id: 'asc' },
    select: { id: true, supplierId: true, reference: true, businessDay: true, width: true, height: true, size: true, createdAt: true, createdBy: { select: { fullName: true } } },
  })
}

export async function supprimerPhoto(id: number) {
  const p = await prisma.invoicePhoto.findUnique({ where: { id }, select: { path: true, thumbPath: true, supplierId: true, reference: true, businessDay: true } })
  if (!p) throw new WorkflowError('Photo introuvable.')
  if (await factureVerrouillee(p)) throw new WorkflowError(FACTURE_VERROUILLEE)
  await prisma.invoicePhoto.delete({ where: { id } })
  await Promise.all([unlink(absolu(p.path)).catch(() => undefined), unlink(absolu(p.thumbPath)).catch(() => undefined)])
  return true
}

/** Le fichier d'une photo, ou de sa vignette. */
export async function fichierPhoto(id: number, mini: boolean) {
  const p = await prisma.invoicePhoto.findUnique({ where: { id }, select: { path: true, thumbPath: true, mime: true } })
  if (!p) return null
  const chemin = absolu(mini ? p.thumbPath : p.path)
  const [donnees, infos] = await Promise.all([readFile(chemin), stat(chemin)])
  return { donnees, type: mini ? (p.thumbPath.endsWith('.webp') ? 'image/webp' : p.thumbPath.endsWith('.png') ? 'image/png' : 'image/jpeg') : p.mime, taille: infos.size }
}

