import { chromium } from 'playwright'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { chargerFeuille, rendrePdf, origineInterne, entier } from '@/server/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rend en PDF les fiches d'articles, sous le filtre de l'écran.
 *
 * `dep` absent ou « tous » : toutes les fiches ; un identifiant : celles du
 * département ; « aucun » : les articles qui n'en ont pas. `q` reprend la
 * recherche en cours. Réservé à l'économat et à l'administration, comme
 * l'écran.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const dep = url.searchParams.get('dep') ?? 'tous'
  const q = (url.searchParams.get('q') ?? '').slice(0, 80)

  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })
  if (user.role !== 'ECONOMAN' && user.role !== 'ADMIN') return new NextResponse('Accès refusé', { status: 403 })

  let nom = 'tous'
  if (dep !== 'tous' && dep !== 'aucun') {
    const d = await prisma.department.findUnique({ where: { id: entier(dep) ?? -1 }, select: { code: true } })
    if (!d) return new NextResponse('Département introuvable', { status: 404 })
    nom = d.code
  } else if (dep === 'aucun') nom = 'sans-departement'

  const base = origineInterne()
  const jar = await cookies()
  const session = jar.get('economan_session')?.value
  if (!session) return new NextResponse('Session absente', { status: 401 })

  const p = new URLSearchParams({ dep })
  if (q) p.set('q', q)

  const browser = await chromium.launch().catch(() => null)
  if (!browser) return new NextResponse('Le rendu PDF est indisponible pour le moment.', { status: 503 })
  try {
    const context = await browser.newContext()
    await context.addCookies([{ name: 'economan_session', value: session, domain: new URL(base).hostname, path: '/' }])
    const page = await context.newPage()
    await chargerFeuille(page, `${base}/economat/fiche-articles/imprimer?${p}`)
    const pdf = await rendrePdf(page, `Fiche articles — ${nom}`)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="fiche-articles-${nom}.pdf"`,
        'cache-control': 'no-store',
      },
    })
  } finally {
    await browser.close()
  }
}
