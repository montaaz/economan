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
  /** Compté par l'employé à la réception ; nul tant qu'il n'a pas vérifié. */
  quantityReceived: number | null
  /** Écart reçu − servi. 0 si conforme ou non vérifié. */
  receiptGap: number
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
  lineCount: number
  totalAsked: number
  totalServed: number
  department: { id: string; name: string; code: string; color: string; icon: string | null }
  createdBy: { fullName: string }
  processedBy: { fullName: string } | null
  lines: ProcessLine[]
}
