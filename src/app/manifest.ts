import type { MetadataRoute } from 'next'

/**
 * L'application installée sur le téléphone (Android : « Ajouter à l'écran
 * d'accueil ») : son nom, son icône Business Bey en vert, et un affichage
 * plein écran, sans la barre du navigateur.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Business Bey — Economan',
    short_name: 'Business Bey',
    description: 'Commandes par département, économat et stock — Business Bey.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f4ea',
    theme_color: '#0e4a2d',
    lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
