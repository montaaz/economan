/**
 * Au démarrage du serveur : l'heure de début de la journée de travail, puis
 * une relecture chaque minute (un autre processus a pu la changer).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { chargerDebutJournee } = await import('./server/day-start')
  await chargerDebutJournee().catch(() => {})
  setInterval(() => { void chargerDebutJournee().catch(() => {}) }, 60_000).unref?.()
}
