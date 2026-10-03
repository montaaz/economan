'use client'

import * as React from 'react'
import { Minus, Plus, RotateCw, Maximize } from 'lucide-react'
import { cn } from '@/lib/utils'

const MIN = 1
const MAX = 8

type Vue = { s: number; x: number; y: number; r: number }
const DEPART: Vue = { s: 1, x: 0, y: 0, r: 0 }

/**
 * Une photo qu'on agrandit pour lire la facture papier : la molette zoome
 * vers le curseur, on déplace l'image en la faisant glisser, deux doigts
 * zooment sur téléphone, un double-clic agrandit l'endroit visé. La barre du
 * bas zoome, tourne la photo (prise de travers) et revient à l'image entière.
 *
 * Le conteneur fixe la taille (`className`) ; l'image y tient entière au
 * départ. Changer de photo repart de l'image entière : la clé est la source.
 */
export function ZoomImage({ src, alt, className, children }: { src: string; alt: string; className?: string; children?: React.ReactNode }) {
  return <ZoomImageInterne key={src} src={src} alt={alt} className={className}>{children}</ZoomImageInterne>
}

function ZoomImageInterne({ src, alt, className, children }: { src: string; alt: string; className?: string; children?: React.ReactNode }) {
  const boite = React.useRef<HTMLDivElement>(null)
  const [vue, setVue] = React.useState<Vue>(DEPART)
  const vueRef = React.useRef(vue)
  React.useLayoutEffect(() => { vueRef.current = vue }, [vue])
  // Les doigts (ou la souris) posés sur l'image, pour glisser et pincer.
  const pointeurs = React.useRef(new Map<number, { x: number; y: number }>())
  const pince = React.useRef<{ dist: number; s: number } | null>(null)
  // Pendant un glissé, l'image suit le doigt sans animation.
  const [glisse, setGlisse] = React.useState(false)

  /** Zoome à l'échelle `s` en gardant immobile le point (px, py) de la boîte. */
  const zoomerVers = React.useCallback((s: number, px?: number, py?: number) => {
    const el = boite.current
    if (!el) return
    setVue((v) => {
      const ns = Math.min(MAX, Math.max(MIN, s))
      if (ns === MIN) return { ...DEPART, r: v.r }
      const cx = el.clientWidth / 2, cy = el.clientHeight / 2
      const dx = (px ?? cx) - cx, dy = (py ?? cy) - cy
      const k = ns / v.s
      return { ...v, s: ns, x: dx - k * (dx - v.x), y: dy - k * (dy - v.y) }
    })
  }, [])

  // La molette doit empêcher le défilement de la fenêtre : écouteur non passif.
  React.useEffect(() => {
    const el = boite.current
    if (!el) return
    const molette = (e: WheelEvent) => {
      e.preventDefault()
      const b = el.getBoundingClientRect()
      zoomerVers(vueRef.current.s * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0015), e.clientX - b.left, e.clientY - b.top)
    }
    el.addEventListener('wheel', molette, { passive: false })
    return () => el.removeEventListener('wheel', molette)
  }, [zoomerVers])

  const position = (e: React.PointerEvent) => {
    const b = boite.current!.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const ecart = () => {
    const [a, b] = [...pointeurs.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }

  const poser = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    boite.current?.setPointerCapture(e.pointerId)
    pointeurs.current.set(e.pointerId, position(e))
    setGlisse(true)
    if (pointeurs.current.size === 2) pince.current = { dist: ecart().dist, s: vueRef.current.s }
  }
  const bouger = (e: React.PointerEvent) => {
    const avant = pointeurs.current.get(e.pointerId)
    if (!avant) return
    const ici = position(e)
    pointeurs.current.set(e.pointerId, ici)
    if (pointeurs.current.size === 2 && pince.current) {
      const { dist, mx, my } = ecart()
      zoomerVers(pince.current.s * (dist / Math.max(pince.current.dist, 1)), mx, my)
    } else if (pointeurs.current.size === 1 && vueRef.current.s > 1) {
      setVue((v) => ({ ...v, x: v.x + ici.x - avant.x, y: v.y + ici.y - avant.y }))
    }
  }
  const lever = (e: React.PointerEvent) => {
    pointeurs.current.delete(e.pointerId)
    if (pointeurs.current.size < 2) pince.current = null
    if (pointeurs.current.size === 0) setGlisse(false)
  }

  const zoome = vue.s > 1.001
  const bouton = 'grid size-9 place-items-center rounded-lg text-white/90 transition-colors hover:bg-white/15 disabled:opacity-35'

  return (
    <div
      ref={boite}
      className={cn('relative touch-none select-none overflow-hidden', zoome ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in', className)}
      onPointerDown={poser} onPointerMove={bouger} onPointerUp={lever} onPointerCancel={lever}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return
        const b = boite.current!.getBoundingClientRect()
        if (zoome) setVue((v) => ({ ...DEPART, r: v.r }))
        else zoomerVers(2.5, e.clientX - b.left, e.clientY - b.top)
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src} alt={alt} draggable={false}
        className="pointer-events-none size-full object-contain"
        style={{ transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.s}) rotate(${vue.r}deg)`, transition: glisse ? 'none' : 'transform 120ms ease-out' }}
      />
      {children}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-[#0f1e33]/85 p-1 shadow-lg backdrop-blur">
        <button type="button" className={bouton} aria-label="Dézoomer" title="Dézoomer" disabled={!zoome} onClick={() => zoomerVers(vue.s / 1.5)}><Minus className="size-4" /></button>
        <button type="button" className="h-9 min-w-14 rounded-lg px-2 text-[0.78rem] font-bold tabular-nums text-white/90 hover:bg-white/15" title="Image entière"
          onClick={() => setVue((v) => ({ ...DEPART, r: v.r }))}>{Math.round(vue.s * 100)} %</button>
        <button type="button" className={bouton} aria-label="Zoomer" title="Zoomer" disabled={vue.s >= MAX} onClick={() => zoomerVers(vue.s * 1.5)}><Plus className="size-4" /></button>
        <span className="mx-0.5 h-5 w-px bg-white/20" />
        <button type="button" className={bouton} aria-label="Tourner la photo" title="Tourner la photo" onClick={() => setVue((v) => ({ ...v, r: (v.r + 90) % 360 }))}><RotateCw className="size-4" /></button>
        <button type="button" className={bouton} aria-label="Image entière" title="Image entière" disabled={!zoome && vue.r === 0} onClick={() => setVue(DEPART)}><Maximize className="size-4" /></button>
      </div>
    </div>
  )
}
