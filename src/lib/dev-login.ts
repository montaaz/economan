/**
 * Connexion préremplie, pour tester.
 *
 * En développement, chaque écran de connexion arrive rempli avec le compte de
 * démo de son espace : un clic sur « Se connecter » et l'on est dedans. La
 * variable est publique parce que les formulaires sont rendus côté client ;
 * elle n'est posée que dans le `.env` de développement, jamais en production
 * — sans elle, les champs sont vides comme il se doit.
 */
export const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === '1'

/** Le mot de passe commun des comptes de démo. */
export const DEV_PASSWORD = DEV_LOGIN ? 'Economan2026!' : ''

/** L'identifiant de démo d'un espace du personnel. */
export function devUsername(role: 'ADMIN' | 'ECONOMAN' | 'CONTROLEUR'): string {
  if (!DEV_LOGIN) return ''
  return role === 'ADMIN' ? 'admin' : role === 'ECONOMAN' ? 'economat' : 'controle'
}
