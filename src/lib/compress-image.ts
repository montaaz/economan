/**
 * Réduit une photo avant l'envoi, dans le navigateur.
 *
 * L'appareil d'un téléphone produit des images de 4 à 8 Mo : on les ramène à
 * 1 800 pixels de côté en JPEG — une facture reste lisible, à 300 Ko
 * environ — et l'on tire une vignette de 360 pixels pour les cartes. Le
 * serveur n'a plus qu'à les écrire, et le réseau du magasin suit.
 */
export type PhotoPrete = { image: Blob; vignette: Blob; largeur: number; hauteur: number }

async function versBlob(source: ImageBitmap, cote: number, qualite: number): Promise<{ blob: Blob; w: number; h: number }> {
  const echelle = Math.min(1, cote / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * echelle)), h = Math.max(1, Math.round(source.height * echelle))
  const toile = document.createElement('canvas')
  toile.width = w; toile.height = h
  const ctx = toile.getContext('2d')
  if (!ctx) throw new Error('Image illisible.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', qualite))
  if (!blob) throw new Error('Image illisible.')
  return { blob, w, h }
}

export async function preparerPhoto(fichier: File): Promise<PhotoPrete> {
  // L'orientation de l'appareil est appliquée : une photo prise en portrait
  // ne se retrouve pas couchée.
  const source = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  try {
    const grande = await versBlob(source, 1800, 0.82)
    const petite = await versBlob(source, 360, 0.7)
    return { image: grande.blob, vignette: petite.blob, largeur: grande.w, hauteur: grande.h }
  } finally {
    source.close()
  }
}
