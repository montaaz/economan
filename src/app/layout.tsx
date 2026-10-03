import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Suspense } from 'react'
import { NavigationProgress } from '@/components/layout/navigation-progress'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Economan — Commandes par département', template: '%s · Economan' },
  description: 'Prise de commande par département, traitement économat et suivi des bons de livraison.',
  applicationName: 'Business Bey',
  // iPhone : « Sur l'écran d'accueil » ouvre l'application en plein écran, avec son nom.
  appleWebApp: { capable: true, title: 'Business Bey', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // La barre du téléphone prend le vert de Business Bey.
  themeColor: '#0e4a2d',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        {children}
      </body>
    </html>
  )
}
