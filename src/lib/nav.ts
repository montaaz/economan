import type { Role } from '@/generated/prisma/enums'

export type NavItem = {
  href: string
  label: string
  /** Nom d'icône lucide, résolu par le composant Icon. */
  icon: string
  /** Affiché dans la barre basse mobile (5 max par rôle). */
  primary?: boolean
  /** Libellé court, quand le libellé complet serait tronqué en bas d'écran. */
  shortLabel?: string
}

export type NavGroup = { title: string; items: NavItem[] }

const EMPLOYEE: NavGroup[] = [
  {
    title: 'Mon département',
    items: [
      { href: '/employe/commande', label: 'Nouvelle commande', shortLabel: 'Commander', icon: 'PlusCircle', primary: true },
      { href: '/employe', label: 'Commandes du service', shortLabel: 'Commandes', icon: 'ClipboardList', primary: true },
    ],
  },
  {
    title: 'Mon compte',
    items: [{ href: '/employe/compte', label: 'Empreinte & sécurité', shortLabel: 'Compte', icon: 'Fingerprint', primary: true }],
  },
]

const ECONOMAN: NavGroup[] = [
  {
    title: 'Économat',
    items: [
      { href: '/economat', label: 'Commandes du jour', shortLabel: 'Jour', icon: 'Inbox', primary: true },
      { href: '/economat/historique', label: 'Historique', icon: 'History', primary: true },
    ],
  },
  {
    title: 'Mon compte',
    items: [{ href: '/economat/compte', label: 'Empreinte & sécurité', shortLabel: 'Compte', icon: 'Fingerprint', primary: true }],
  },
]

const ADMIN: NavGroup[] = [
  {
    title: 'Pilotage',
    items: [
      { href: '/admin', label: 'Tableau de bord', shortLabel: 'Accueil', icon: 'LayoutDashboard', primary: true },
      { href: '/admin/historique', label: 'Historique', icon: 'History', primary: true },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/admin/departements', label: 'Départements', shortLabel: 'Départ.', icon: 'Building2', primary: true },
      { href: '/admin/stock-fixe', label: 'Stock fixe', shortLabel: 'Stock', icon: 'Target', primary: true },
      { href: '/admin/utilisateurs', label: 'Utilisateurs', shortLabel: 'Agents', icon: 'Users', primary: true },
    ],
  },
]

export function navForRole(role: Role): NavGroup[] {
  if (role === 'ADMIN') return ADMIN
  if (role === 'ECONOMAN') return ECONOMAN
  return EMPLOYEE
}

export function primaryNav(role: Role): NavItem[] {
  return navForRole(role).flatMap((g) => g.items).filter((i) => i.primary).slice(0, 5)
}

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: 'Employé',
  ECONOMAN: 'Économat',
  ADMIN: 'Administrateur',
}
