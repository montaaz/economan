import 'server-only'
import webpush from 'web-push'
import { prisma } from '@/server/db'

/**
 * Les notifications push de l'économat : elles arrivent sur le téléphone ou
 * le PC même écran éteint, page fermée — c'est le système qui sonne.
 */
let pret = false
function configurer() {
  if (pret) return true
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv)
  pret = true
  return true
}

type Message = { title: string; body: string; tag: string; url: string; urgent: boolean }

/** Envoie à tous les appareils de l'économat ; un abonnement expiré se supprime. */
async function envoyer(m: Message) {
  if (!configurer()) return 0
  const abonnes = await prisma.pushSubscription.findMany({ where: { user: { role: 'ECONOMAN', isActive: true } } })
  let n = 0
  await Promise.all(abonnes.map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(m), { TTL: 600, urgency: 'high' })
      n += 1
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await prisma.pushSubscription.deleteMany({ where: { id: a.id } })
    }
  }))
  return n
}

/** Une commande vient d'arriver : l'économat est prévenu. */
export async function notifierCommande(orderId: number, rappel = false) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, reference: true, isUrgent: true, status: true, department: { select: { name: true } }, createdBy: { select: { fullName: true } } },
  })
  if (!o || o.status !== 'PENDING') return 0
  return envoyer({
    title: o.isUrgent ? `🚨 COMMANDE URGENTE — ${o.department.name}` : `🛎️ Nouvelle commande — ${o.department.name}`,
    body: `${o.reference} · ${o.createdBy.fullName}${rappel ? ' · toujours en attente' : ''} — touchez pour l’ouvrir`,
    tag: `commande-${o.id}`,
    url: `/economat/commandes/${o.id}`,
    urgent: o.isUrgent,
  })
}

/**
 * Les rappels : tant qu'une commande reste en attente, l'économat est
 * relancé — toutes les 2 minutes, l'urgente à chaque tour. On s'arrête
 * à l'acceptation, ou au bout de 3 heures.
 */
const dernierRappel = new Map<number, number>()
export async function rappelerCommandesEnAttente() {
  const maintenant = Date.now()
  const enAttente = await prisma.order.findMany({
    where: { status: 'PENDING', createdAt: { gte: new Date(maintenant - 3 * 3600_000), lte: new Date(maintenant - 90_000) } },
    select: { id: true, isUrgent: true },
  })
  const ids = new Set(enAttente.map((o) => o.id))
  for (const id of dernierRappel.keys()) if (!ids.has(id)) dernierRappel.delete(id)
  for (const o of enAttente) {
    const pause = o.isUrgent ? 60_000 : 120_000
    if (maintenant - (dernierRappel.get(o.id) ?? 0) < pause) continue
    dernierRappel.set(o.id, maintenant)
    await notifierCommande(o.id, true).catch(() => 0)
  }
}
