import { chromium } from 'playwright'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { chargerFeuille, rendrePdf } from '@/server/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rend la feuille d'une commande en PDF.
 *
 * Le navigateur écrit en marge de chaque page imprimée le titre de l'onglet,
 * l'URL, la date et la pagination. Aucun CSS ne les retire — vérifié — car ils
 * sont ajoutés après le rendu du document. Un PDF produit ici ne porte que le
 * pied qu'on lui donne : la référence et « Page n / N ».
 *
 * La page est rendue par un navigateur sans interface, avec la session de
 * l'appelant : les gardes d'accès des pages s'appliquent donc telles quelles.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Même garde que les écrans : on refuse avant de lancer un navigateur, qui
  // coûte cher.
  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    select: { id: true, reference: true, departmentId: true, createdById: true },
  })
  if (!order) return new NextResponse('Commande introuvable', { status: 404 })

  // Un employé n'imprime que les commandes de son département.
  if (user.role === 'EMPLOYEE' && order.departmentId !== user.departmentId) {
    return new NextResponse('Accès refusé', { status: 403 })
  }

  // La page à rendre dépend du rôle : chacune a ses propres gardes.
  const chemin = user.role === 'EMPLOYEE'
    ? `/employe/commandes/${order.id}`
    : user.role === 'ADMIN'
      ? `/admin/commandes/${order.id}`
      : `/economat/commandes/${order.id}`

  const base = new URL(request.url).origin
  const jar = await cookies()
  const session = jar.get('economan_session')?.value
  if (!session) return new NextResponse('Session absente', { status: 401 })

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    await context.addCookies([{
      name: 'economan_session',
      value: session,
      domain: new URL(base).hostname,
      path: '/',
    }])
    const page = await context.newPage()
    await chargerFeuille(page, `${base}${chemin}`)

    const pdf = await rendrePdf(page, order.reference)

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        // `inline` ouvre le visualiseur intégré, d'où l'impression se fait
        // sans en-tête : c'est un PDF, plus une page web.
        'content-disposition': `inline; filename="${order.reference}.pdf"`,
        'cache-control': 'no-store',
      },
    })
  } finally {
    await browser.close()
  }
}
