import { chromium } from 'playwright'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rend en PDF le bon d'un passage, pour tout un département.
 *
 * Un même service touche plusieurs commandes du même rayon : un seul papier
 * suffit à celui qui porte la marchandise.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const dep = url.searchParams.get('dep')
  const rang = url.searchParams.get('rang')
  const jour = url.searchParams.get('jour')

  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })
  if (user.role === 'EMPLOYEE') return new NextResponse('Accès refusé', { status: 403 })
  if (!dep || !rang) return new NextResponse('Paramètres manquants', { status: 400 })

  const departement = await prisma.department.findUnique({
    where: { id: Number(dep) },
    select: { code: true },
  })
  if (!departement) return new NextResponse('Service introuvable', { status: 404 })

  const base = url.origin
  const jar = await cookies()
  const session = jar.get('economan_session')?.value
  if (!session) return new NextResponse('Session absente', { status: 401 })

  const p = new URLSearchParams({ dep, rang })
  if (jour) p.set('jour', jour)

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
    await page.goto(`${base}/economat/services/service?${p}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    const pdf = await page.pdf({ format: 'A4', printBackground: true })

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition':
          `inline; filename="${departement.code}-service-${rang}.pdf"`,
        'cache-control': 'no-store',
      },
    })
  } finally {
    await browser.close()
  }
}
