/**
 * Forme d'une commande telle que la renvoie ORDER_QUERY.
 * Partagée par l'écran de traitement (économat) et la consultation (admin) :
 * elle vit ici plutôt que dans une page, pour qu'un déplacement de route ne
 * casse pas les imports.
 */
export type LineStatus = 'PENDING' | 'VALIDATED' | 'ADJUSTED' | 'REJECTED'

export type ProcessLine = {
  id: string
  productName: string
  productRef: string
  categoryName: string
  unitSymbol: string
  /** Cible et stock compté figés à l'envoi — d'où vient la quantité. */
  stockFixe: number
  quantityOnHand: number
  quantityAsked: number
  quantityServed: number | null
  /** Ce qui a été complété lors des services suivants. */
  quantityRefilled: number
  /** Le détail par passage, pour pouvoir en annuler un seul. */
  refills: { rank: number; quantity: number }[]
  /** Compté par l'employé à la réception ; nul tant qu'il n'a pas vérifié. */
  quantityReceived: number | null
  /** Écart reçu − servi. 0 si conforme ou non vérifié. */
  receiptGap: number
  /** Ce qu'il reste à servir pour que le rayon atteigne sa commande, manquant compris. */
  remaining: number
  /** Compté en moins à la réception, sans servi de remplacement en route. */
  missing: number
  status: LineStatus
  rejectReason: string | null
}

export type ProcessOrder = {
  id: string
  reference: string
  ticketNumber: number
  businessDay: string
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED'
  note: string | null
  createdAt: string
  // Les heures de passage d'une étape à l'autre : « le bon est parti quand ? »
  // est la question qu'on pose en rouvrant une commande traitée.
  acceptedAt: string | null
  deliveredAt: string | null
  receivedAt: string | null
  /** Rang du dernier service complémentaire ; 1 si aucun. */
  lastRefillRank: number
  /**
   * Les passages, pour imprimer le bon du dernier — et savoir lesquels le
   * département a déjà réceptionnés : ceux-là ne se suppriment plus.
   */
  refills: {
    id: string
    rank: number
    receivedAt: string | null
    receivedBy: { fullName: string } | null
  }[]
  lineCount: number
  totalAsked: number
  totalServed: number
  department: { id: string; name: string; code: string; color: string; icon: string | null }
  createdBy: { fullName: string }
  processedBy: { fullName: string } | null
  lines: ProcessLine[]
}
