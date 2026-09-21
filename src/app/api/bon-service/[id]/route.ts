import { chromium } from 'playwright'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rend en PDF le bon d'un service complémentaire.
 *
 * Même principe que le bon de commande : un navigateur sans interface rend la
 * feuille avec la session de l'appelant, ce qui évite les en-têtes que le
 * navigateur ajoute à toute page imprimée.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })
  // Le bon d'un service sort du magasin : il n'est pas émis par un département.
  if (user.role === 'EMPLOYEE') return new NextResponse('Accès refusé', { status: 403 })

  const refill = await prisma.orderRefill.findUnique({
    where: { id: Number(id) },
    select: { id: true, rank: true, order: { select: { reference: true } } },
  })
  if (!refill) return new NextResponse('Service introuvable', { status: 404 })

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
    await page.goto(`${base}/economat/services/${refill.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    const pdf = await page.pdf({ format: 'A4', printBackground: true })

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition':
          `inline; filename="${refill.order.reference}-service-${refill.rank}.pdf"`,
        'cache-control': 'no-store',
      },
    })
  } finally {
    await browser.close()
  }
}
