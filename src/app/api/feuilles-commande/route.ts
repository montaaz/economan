import { chromium } from 'playwright'
import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { feuillesCommandeHtml } from '@/server/feuilles-commande'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Les feuilles de commande vierges en PDF : `dep=tous` (un fichier, chaque
 * département sur ses pages) ou `dep=<id>`. Administration seulement.
 */
export async function GET(request: Request) {
  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })
  if (user.role !== 'ADMIN') return new NextResponse('Réservé à l’administration', { status: 403 })

  const dep = new URL(request.url).searchParams.get('dep') ?? 'tous'
  const id = Number(dep)
  if (dep !== 'tous' && !Number.isInteger(id)) return new NextResponse('Département invalide', { status: 400 })
  const nom = dep === 'tous' ? 'tous-les-departements'
    : (await prisma.department.findUnique({ where: { id }, select: { name: true } }))?.name
  if (!nom) return new NextResponse('Département introuvable', { status: 404 })

  const html = await feuillesCommandeHtml(dep === 'tous' ? 'tous' : [id])
  const browser = await chromium.launch().catch(() => null)
  if (!browser) return new NextResponse('Le rendu PDF est indisponible pour le moment.', { status: 503 })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;color:#4a5f7d;width:100%;padding:0 10mm;text-align:right">Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    })
    const fichier = `feuilles-commande-${nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${fichier}"`, 'cache-control': 'no-store' },
    })
  } finally {
    await browser.close()
  }
}
