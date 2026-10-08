import { chromium } from 'playwright'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { chargerFeuille, rendrePdf, origineInterne } from '@/server/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rend en PDF les écarts de la journée : `type` (rupture, ajuste, tous),
 * `jour`, `jusquau`, et `dep` pour un seul département. Sans `dep`, tous les
 * départements, chacun sur sa page. Économat et administration.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })
  if (user.role !== 'ECONOMAN' && user.role !== 'ADMIN') return new NextResponse('Accès refusé', { status: 403 })

  const p = new URLSearchParams()
  for (const cle of ['type', 'jour', 'jusquau', 'dep']) {
    const v = url.searchParams.get(cle)
    if (v) p.set(cle, v.slice(0, 40))
  }
  const type = p.get('type') ?? 'rupture'
  const titre = type === 'ajuste' ? 'Ajustées' : type === 'tous' ? 'Écarts' : 'Ruptures'

  const base = origineInterne()
  const jar = await cookies()
  const session = jar.get('economan_session')?.value
  if (!session) return new NextResponse('Session absente', { status: 401 })

  const browser = await chromium.launch().catch(() => null)
  if (!browser) return new NextResponse('Le rendu PDF est indisponible pour le moment.', { status: 503 })
  try {
    const context = await browser.newContext()
    await context.addCookies([{ name: 'economan_session', value: session, domain: new URL(base).hostname, path: '/' }])
    const page = await context.newPage()
    await chargerFeuille(page, `${base}/economat/ecarts/imprimer?${p}`)
    const jour = p.get('jour') ?? ''
    const pdf = await rendrePdf(page, `${titre} de la journée — ${jour}`.trim())
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}-${jour || 'jour'}.pdf"`,
        'cache-control': 'no-store',
      },
    })
  } finally {
    await browser.close()
  }
}
