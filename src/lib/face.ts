'use client'

/**
 * La reconnaissance du visage, côté navigateur : face-api.js et ses trois
 * modèles (détecteur léger, 68 repères du visage, signature). Ils se
 * chargent une seule fois par page — la promesse est gardée — et peuvent
 * l'être d'avance, dès qu'on montre la liste des agents.
 */
type FaceApi = typeof import('face-api.js')

let chargement: Promise<FaceApi> | null = null

export function chargerVisage(): Promise<FaceApi> {
  if (!chargement) {
    chargement = (async () => {
      const faceapi = await import('face-api.js')
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ])
      return faceapi
    })()
    // Un échec (réseau) ne doit pas bloquer les essais suivants.
    chargement.catch(() => { chargement = null })
  }
  return chargement
}

/** Ce qu'une image dit du visage : où il est, comment la tête est tournée, et sa signature. */
export type Analyse = {
  /** Le visage dans l'image, en fractions de sa largeur et de sa hauteur (0 à 1). */
  centreX: number; centreY: number; taille: number
  /**
   * La rotation de la tête, sans unité : lacet (gauche/droite, du point de vue
   * de l'agent qui se voit en miroir) et tangage (haut/bas). 0 = de face.
   */
  lacet: number; tangage: number
  signature: number[] | null
}

/**
 * Analyse le visage visible dans la vidéo — ou null s'il n'y en a aucun, ou
 * plusieurs (à deux devant la caméra, on ne sait pas qui se connecte). La
 * signature, plus coûteuse, ne se calcule que si on la demande.
 */
export async function analyser(video: HTMLVideoElement, avecSignature: boolean): Promise<Analyse | null> {
  const faceapi = await chargerVisage()
  if (video.readyState < 2 || video.videoWidth === 0) return null
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })
  const base = faceapi.detectAllFaces(video, options).withFaceLandmarks(true)
  const visages = avecSignature ? await base.withFaceDescriptors() : await base
  if (visages.length !== 1) return null
  const v = visages[0]
  const p = v.landmarks.positions
  const box = v.detection.box
  // Le lacet : le bout du nez par rapport au milieu de la mâchoire.
  const gauche = p[0], droite = p[16], nez = p[30], menton = p[8]
  const largeurVisage = Math.max(droite.x - gauche.x, 1)
  const lacetBrut = (nez.x - (gauche.x + droite.x) / 2) / largeurVisage
  // Le tangage : le nez entre la ligne des yeux et le menton.
  const yeuxY = p.slice(36, 48).reduce((n, q) => n + q.y, 0) / 12
  const tangageBrut = (nez.y - yeuxY) / Math.max(menton.y - yeuxY, 1)
  return {
    centreX: (box.x + box.width / 2) / video.videoWidth,
    centreY: (box.y + box.height / 2) / video.videoHeight,
    taille: box.width / video.videoWidth,
    // L'image est montrée en miroir : la droite de l'agent est la droite de l'écran.
    lacet: -lacetBrut * 2,
    tangage: tangageBrut,
    signature: avecSignature && 'descriptor' in v ? Array.from((v as { descriptor: Float32Array }).descriptor) : null,
  }
}

/** La signature du visage visible dans la vidéo, ou null. */
export async function signature(video: HTMLVideoElement): Promise<number[] | null> {
  return (await analyser(video, true))?.signature ?? null
}

/** Ouvre la caméra de face et l'attache à la vidéo. */
export async function ouvrirCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra indisponible sur cet appareil (une connexion HTTPS est requise).')
  const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
  video.srcObject = flux
  await video.play().catch(() => {})
  return flux
}

export function fermerCamera(flux: MediaStream | null) {
  flux?.getTracks().forEach((t) => t.stop())
}
