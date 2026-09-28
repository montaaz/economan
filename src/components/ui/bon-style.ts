import { cn } from '@/lib/utils'

/**
 * Le bouton qui sort un bon est gros et impossible à manquer, partout. Sa
 * couleur dit quel papier sort : bleu pour le bon de commande, orange pour
 * le ticket, magenta pour le bon de livraison — celui qui part avec la
 * marchandise. Les liens `<a>` qui ouvrent un bon reprennent la même classe.
 *
 * Ce module n'est pas « client » : les fiches rendues sur le serveur
 * l'appellent aussi, et une fonction d'un module client ne s'appelle pas
 * depuis le serveur.
 */
export type TeinteBon = 'commande' | 'ticket' | 'livraison'

export const TEINTES: Record<TeinteBon, string> = {
  commande: 'border-[#2d3fb5] bg-gradient-to-r from-[#3a4fd6] to-[#5b6cf0] shadow-[0_10px_24px_-10px_rgb(58_79_214/0.75)]',
  ticket: 'border-[#b85c0a] bg-gradient-to-r from-[#e0700f] to-[#f28c2b] shadow-[0_10px_24px_-10px_rgb(224_112_15/0.75)]',
  livraison: 'border-[#a1136b] bg-gradient-to-r from-[#c81e7a] to-[#e0246f] shadow-[0_10px_24px_-10px_rgb(200_30_122/0.75)]',
}

// Les mêmes, en « ! » : elles l'emportent sur les couleurs du variant
// primaire de Button. Écrites en toutes lettres — Tailwind ne génère que
// les classes qu'il lit dans le code, pas celles composées à l'exécution.
export const TEINTES_FORTES: Record<TeinteBon, string> = {
  commande: '!border-[#2d3fb5] !bg-gradient-to-r !from-[#3a4fd6] !to-[#5b6cf0] !shadow-[0_10px_24px_-10px_rgb(58_79_214/0.75)]',
  ticket: '!border-[#b85c0a] !bg-gradient-to-r !from-[#e0700f] !to-[#f28c2b] !shadow-[0_10px_24px_-10px_rgb(224_112_15/0.75)]',
  livraison: '!border-[#a1136b] !bg-gradient-to-r !from-[#c81e7a] !to-[#e0246f] !shadow-[0_10px_24px_-10px_rgb(200_30_122/0.75)]',
}

export function boutonBon(teinte: TeinteBon = 'livraison') {
  return cn(
    'inline-flex h-12 items-center gap-2 rounded-2xl border px-6 text-[1rem] font-bold text-white transition hover:brightness-110 disabled:opacity-60',
    TEINTES[teinte],
  )
}
