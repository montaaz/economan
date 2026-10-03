'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/** Le nombre de traits autour du cercle, comme sur l'écran de Face ID. */
export const TRAITS = 60

export type EtatScan = 'attente' | 'scan' | 'ok' | 'ko'

/**
 * Le viseur de Face ID : la caméra dans un cercle, entourée de traits qui
 * s'allument en vert à mesure que la tête tourne (enregistrement), ou d'un
 * balayage qui tourne pendant la reconnaissance (connexion). Reconnu, le
 * cercle devient vert avec une coche ; refusé, il tremble en rouge.
 */
export function ViseurVisage({ video, allumes, etat, taille = 280, progression }: {
  video: React.RefObject<HTMLVideoElement | null>
  /** Les traits allumés (enregistrement) ; vide pendant une connexion. */
  allumes?: boolean[]
  etat: EtatScan
  taille?: number
  /** 0 à 1 : la part du cercle déjà parcourue, pour l'annoncer aux lecteurs d'écran. */
  progression?: number
}) {
  const marge = 26
  const total = taille + marge * 2
  const c = total / 2
  const r1 = taille / 2 + 8, r2 = taille / 2 + 22
  return (
    <div className={cn('relative mx-auto select-none', etat === 'ko' && 'animate-[face-tremble_0.45s_ease-in-out]')}
      style={{ width: total, height: total }}
      role="img" aria-label={etat === 'ok' ? 'Visage reconnu' : progression !== undefined ? `Enregistrement du visage : ${Math.round(progression * 100)} %` : 'Reconnaissance du visage'}>
      <style>{`
        @keyframes face-tremble { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-10px) } 40% { transform: translateX(9px) } 60% { transform: translateX(-6px) } 80% { transform: translateX(4px) } }
        @keyframes face-balayage { to { transform: rotate(360deg) } }
        @keyframes face-coche { from { stroke-dashoffset: 60 } to { stroke-dashoffset: 0 } }
        @keyframes face-apparait { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }
      `}</style>

      {/* La caméra, ronde, en miroir. */}
      <div className="absolute overflow-hidden rounded-full bg-black" style={{ left: marge, top: marge, width: taille, height: taille }}>
        <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />
        {etat === 'ok' ? (
          <div className="absolute inset-0 grid place-items-center bg-[#0f8a4b]/55 backdrop-blur-[2px]">
            <svg viewBox="0 0 52 52" className="size-24 animate-[face-apparait_0.35s_ease-out]">
              <circle cx="26" cy="26" r="24" fill="none" stroke="white" strokeWidth="3" opacity=".9" />
              <path d="M15 27 l8 8 l15 -17" fill="none" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="60" className="animate-[face-coche_0.45s_ease-out_0.15s_both]" />
            </svg>
          </div>
        ) : null}
      </div>

      {/* Les traits autour du cercle. */}
      <svg className="absolute inset-0" width={total} height={total} viewBox={`0 0 ${total} ${total}`}>
        {Array.from({ length: TRAITS }, (_, i) => {
          const a = (i / TRAITS) * Math.PI * 2 - Math.PI / 2
          const allume = etat === 'ok' || (allumes?.[i] ?? false)
          return (
            <line key={i}
              x1={c + Math.cos(a) * r1} y1={c + Math.sin(a) * r1} x2={c + Math.cos(a) * r2} y2={c + Math.sin(a) * r2}
              strokeWidth={4} strokeLinecap="round"
              stroke={etat === 'ko' ? '#ef4444' : allume ? '#34d399' : 'rgba(255,255,255,0.22)'}
              style={{ transition: 'stroke 0.25s ease' }} />
          )
        })}
      </svg>

      {/* Le balayage de la reconnaissance : un arc lumineux qui tourne. */}
      {etat === 'scan' ? (
        <div className="pointer-events-none absolute inset-0 animate-[face-balayage_1.6s_linear_infinite]">
          <svg width={total} height={total} viewBox={`0 0 ${total} ${total}`}>
            <defs>
              <linearGradient id="face-arc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#60a5fa" stopOpacity="0" />
                <stop offset="1" stopColor="#60a5fa" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path d={`M ${c} ${c - (r1 + r2) / 2} A ${(r1 + r2) / 2} ${(r1 + r2) / 2} 0 0 1 ${c + (r1 + r2) / 2} ${c}`}
              fill="none" stroke="url(#face-arc)" strokeWidth={16} strokeLinecap="round" />
          </svg>
        </div>
      ) : null}
    </div>
  )
}
