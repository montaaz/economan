import { networkInterfaces } from 'node:os'
import type { NextConfig } from 'next'

/**
 * Origines autorisées à joindre les ressources de développement (HMR).
 *
 * Next bloque par défaut tout ce qui n'est pas « localhost », ce qui empêche
 * de tester depuis un téléphone sur le réseau local. On autorise donc les
 * adresses IPv4 privées de la machine — figer une IP la périmerait au
 * prochain bail DHCP.
 *
 * Volontairement limité au développement : en production, Next ne sert pas ces
 * ressources et la liste n'est jamais lue.
 */
function localOrigins(): string[] {
  const found = new Set<string>()

  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      // Réseaux privés uniquement (RFC 1918) : une IP publique n'a rien à
      // faire dans cette liste, même en développement.
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        found.add(a.address)
      }
    }
  }

  // Échappatoire pour un cas non couvert (tunnel, machine virtuelle, docker).
  for (const extra of (process.env.DEV_ORIGINS ?? '').split(',')) {
    const v = extra.trim()
    if (v) found.add(v)
  }

  return [...found]
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['lucide-react'] },
  allowedDevOrigins: localOrigins(),
}

export default nextConfig
