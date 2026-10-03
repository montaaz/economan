import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { fichierPhoto } from '@/server/services/invoice-photos'
import { entier } from '@/server/pdf'

export const dynamic = 'force-dynamic'

/** Une photo de facture, ou sa vignette avec `?mini=1`. Économat et administration. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readSession()
  if (!user) return new NextResponse('Non authentifié', { status: 401 })
  if (user.role !== 'ECONOMAN' && user.role !== 'ADMIN') return new NextResponse('Accès refusé', { status: 403 })
  const id = entier((await params).id)
  if (!id) return new NextResponse('Photo introuvable', { status: 404 })
  const mini = new URL(request.url).searchParams.get('mini') === '1'
  const f = await fichierPhoto(id, mini).catch(() => null)
  if (!f) return new NextResponse('Photo introuvable', { status: 404 })
  return new NextResponse(new Uint8Array(f.donnees), {
    headers: {
      'content-type': f.type,
      'content-length': String(f.taille),
      // Une photo ne change jamais : le navigateur la garde, pour ce compte seul.
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
}
