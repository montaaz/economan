'use client'

/**
 * La reconnaissance du visage, côté navigateur : face-api.js et ses trois
 * modèles (détecteur léger, repères du visage, signature). Ils se chargent
 * une seule fois par page — la promesse est gardée — et peuvent l'être
 * d'avance, dès qu'on montre la liste des agents.
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

/** La signature du visage visible dans la vidéo, ou null s'il n'y en a pas (ou plusieurs). */
export async function signature(video: HTMLVideoElement): Promise<number[] | null> {
  const faceapi = await chargerVisage()
  if (video.readyState < 2 || video.videoWidth === 0) return null
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
  const visages = await faceapi.detectAllFaces(video, options).withFaceLandmarks(true).withFaceDescriptors()
  // Un seul visage : à deux devant la caméra, on ne sait pas qui se connecte.
  if (visages.length !== 1) return null
  return Array.from(visages[0].descriptor)
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
