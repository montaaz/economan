import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { extractText, parseLines, matchLines } from '@/server/services/z-import'

export const dynamic = 'force-dynamic'

/** 8 Mo : un Z tient en quelques pages, au-delà c'est une erreur de fichier. */
const MAX = 8 * 1024 * 1024

/**
 * Lecture d'un fichier de note Z déposé par le contrôle de gestion.
 *
 * L'endpoint ne fait que lire et rapprocher : rien n'est enregistré ici. Le
 * contrôleur voit ce qui a été reconnu, corrige ce qui ne l'a pas été, puis
 * enregistre par la mutation habituelle — un fichier mal lu ne doit jamais
 * écrire une recette fausse en base.
 */
export async function POST(request: Request) {
  const user = await readSession()
  if (!user) {
    return NextResponse.json({ error: 'Vous n’êtes pas connecté.' }, { status: 401 })
  }
  if (user.role !== 'CONTROLEUR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Accès réservé au contrôle de gestion.' }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Ce fichier est vide.' }, { status: 400 })
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: 'Fichier trop volumineux (8 Mo maximum).' }, { status: 400 })
  }

  const nom = file.name.toLowerCase()
  const accepte = ['.pdf', '.csv', '.txt', '.xlsx', '.xls'].some((e) => nom.endsWith(e))
  if (!accepte) {
    return NextResponse.json(
      { error: 'Format non reconnu : déposez un PDF, un CSV ou un tableur.' },
      { status: 400 },
    )
  }

  let texte: string
  try {
    texte = await extractText({
      name: file.name,
      type: file.type,
      buffer: await file.arrayBuffer(),
    })
  } catch {
    return NextResponse.json(
      { error: 'Ce fichier n’a pas pu être lu. S’il est scanné, saisissez le Z à la main.' },
      { status: 422 },
    )
  }

  const lues = parseLines(texte)
  if (lues.length === 0) {
    return NextResponse.json(
      {
        error: 'Aucune ligne de vente trouvée dans ce fichier. '
          + 'S’il s’agit d’un PDF scanné, son texte n’est pas lisible : saisissez le Z à la main.',
      },
      { status: 422 },
    )
  }

  const card = await prisma.salesItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
  })
  const lines = matchLines(lues, card)

  return NextResponse.json({
    fileName: file.name,
    lineCount: lines.length,
    matchedCount: lines.filter((l) => l.itemId !== null).length,
    lines,
  })
}
