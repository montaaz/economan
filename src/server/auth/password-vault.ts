import 'server-only'
import crypto from 'node:crypto'

/**
 * Le coffre des mots de passe : une copie chiffrée, lisible par
 * l'administration seule, à côté de l'empreinte bcrypt qui sert à la
 * connexion. AES-256-GCM, clé tirée d'AUTH_SECRET : sans le secret du
 * serveur, la base seule ne livre aucun mot de passe.
 */
function cle() {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET manquant.')
  return crypto.createHash('sha256').update(`economan:mots-de-passe:${s}`).digest()
}

export function chiffrerMotDePasse(clair: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', cle(), iv)
  const donnees = Buffer.concat([c.update(clair, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), donnees.toString('base64')].join(':')
}

export function dechiffrerMotDePasse(enc: string | null | undefined): string | null {
  if (!enc) return null
  try {
    const [v, iv, tag, donnees] = enc.split(':')
    if (v !== 'v1') return null
    const d = crypto.createDecipheriv('aes-256-gcm', cle(), Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(donnees, 'base64')), d.final()]).toString('utf8')
  } catch {
    // Secret changé ou donnée altérée : on ne sait plus le relire.
    return null
  }
}
