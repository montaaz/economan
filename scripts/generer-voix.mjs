// Génère les annonces vocales de l'économat (public/sons) avec ElevenLabs.
// Usage : node scripts/generer-voix.mjs  (clé lue dans .env : ELEVENLABS_API_KEY)
// La clé doit avoir la permission « Text to Speech ». Elle n'est jamais enregistrée.
import 'dotenv/config'
import fs from 'node:fs'

const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) { console.error('ELEVENLABS_API_KEY manquante.'); process.exit(1) }
const VOIX = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9' // Jessica : jeune, claire, chaleureuse
const DEPARTEMENTS = { bar: 'Bar', cuisine: 'Cuisine', patisserie: 'Pâtisserie', 'fast-food': 'Fast food', menage: 'Ménage', chicha: 'Chicha', 'petit-dejeuner': 'Petit Déjeuner', embalage: 'Emballage' }

fs.mkdirSync('public/sons', { recursive: true })
async function generer(texte, fichier, style) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOIX}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texte, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.35, similarity_boost: 0.85, style, use_speaker_boost: true } }),
  })
  if (!r.ok) throw new Error(`${fichier} : ${r.status} ${await r.text()}`)
  fs.writeFileSync(fichier, Buffer.from(await r.arrayBuffer()))
  console.log('✓', fichier)
}
for (const [slug, nom] of Object.entries(DEPARTEMENTS)) {
  await generer(`Nouvelle commande ! ${nom} ! Nouvelle commande, ${nom} !`, `public/sons/commande-${slug}.mp3`, 0.55)
  await generer(`Attention ! Commande urgente ! ${nom} ! Commande urgente, ${nom} ! Merci de la traiter tout de suite !`, `public/sons/urgent-${slug}.mp3`, 0.85)
}
