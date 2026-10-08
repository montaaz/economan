/**
 * Au démarrage du serveur : l'heure de début de la journée de travail, puis
 * une relecture chaque minute (un autre processus a pu la changer).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { chargerDebutJournee, redaterCommandes } = await import('./server/day-start')
  await chargerDebutJournee().catch((e) => console.error('[journée] lecture impossible :', e))
  // Les commandes passées la nuit avant le réglage rejoignent leur journée.
  await redaterCommandes().then((n) => { if (n) console.log(`[journée] ${n} commande(s) rangée(s) dans leur journée de travail`) }).catch((e) => console.error('[journée] rangement impossible :', e))
  setInterval(() => { void chargerDebutJournee().catch(() => {}) }, 60_000).unref?.()
}
