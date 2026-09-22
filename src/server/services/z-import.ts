import 'server-only'

/**
 * Lecture d'un fichier de note Z : PDF, CSV ou tableur.
 *
 * Une caisse n'exporte jamais deux fois le même format. Plutôt que de coller
 * à un gabarit précis — qui casserait au premier changement de logiciel — on
 * cherche dans chaque ligne le couple « libellé, quantité », et on rapproche
 * le libellé de la carte. Ce qui n'est pas reconnu est rendu tel quel, pour
 * que le contrôleur tranche à l'écran plutôt que de se voir imposer un
 * rapprochement faux.
 */

export type ParsedLine = {
  /** Le libellé tel qu'il figure dans le fichier. */
  label: string
  /** Le code de caisse, si la ligne en porte un. */
  code: string | null
  quantity: number
  amount: number | null
}

export type MatchedLine = ParsedLine & {
  /** L'article de la carte reconnu, s'il y en a un. */
  itemId: string | null
  itemName: string | null
  /** Comment le rapprochement s'est fait — ce que l'écran explique. */
  how: 'code' | 'name' | 'approx' | null
}

export type CardEntry = { id: number; name: string; code: string | null }

/** Compare des libellés sans se soucier de la casse, des accents ni du bruit. */
function normalize(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Le nombre décimal d'un champ, format français ou anglais.
 *
 * « 1 234,50 » et « 1,234.50 » désignent la même somme selon la caisse. On
 * tranche sur le dernier séparateur : c'est lui qui porte les décimales.
 */
function toNum(v: string): number | null {
  const brut = v.replace(/\s| /g, '')
  if (!/[0-9]/.test(brut)) return null
  const virgule = brut.lastIndexOf(',')
  const point = brut.lastIndexOf('.')
  let net = brut
  if (virgule > point) net = brut.replace(/\./g, '').replace(',', '.')
  else if (point > virgule) net = brut.replace(/,/g, '')
  else net = brut.replace(/[,.]/g, '')
  const n = Number(net.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Découpe une ligne de texte en champs : CSV, point-virgule, tabulation. */
function splitFields(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  if ((line.match(/,/g)?.length ?? 0) >= 2) return line.split(',')
  return [line]
}

const IGNORER = [
  'total', 'sous total', 'sous-total', 'tva', 'net a payer', 'especes', 'carte',
  'nombre de tickets', 'caisse', 'cloture', 'ouverture', 'date', 'heure',
  'article', 'designation', 'libelle', 'quantite', 'qte', 'montant', 'prix',
]

/** Une ligne de pied de ticket n'est pas une vente. */
function estBruit(label: string): boolean {
  const n = normalize(label)
  if (!n || n.length < 2) return true
  return IGNORER.some((mot) => n === mot || n.startsWith(mot + ' '))
}

/**
 * Extrait les lignes de vente d'un texte plat.
 *
 * Deux formes couvrent l'essentiel : des champs séparés (CSV, tableur), et du
 * texte libre où la quantité et le montant ferment la ligne — c'est ainsi que
 * s'imprime un Z.
 */
export function parseLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = []

  for (const brute of text.split(/\r?\n/)) {
    const ligne = brute.trim()
    if (!ligne) continue

    const champs = splitFields(ligne).map((c) => c.trim()).filter((c) => c !== '')
    if (champs.length >= 2) {
      // Le libellé est le premier champ non numérique ; la quantité, le
      // premier nombre qui suit ; le montant, le dernier nombre de la ligne.
      const idxLabel = champs.findIndex((c) => toNum(c) === null)
      if (idxLabel !== -1) {
        const label = champs[idxLabel]
        const apres = champs.slice(idxLabel + 1)
        const nombres = apres.map(toNum).filter((n): n is number => n !== null)
        if (nombres.length > 0 && !estBruit(label)) {
          const code = idxLabel > 0 ? champs[0] : null
          out.push({
            label,
            code: code && code !== label ? code : null,
            quantity: nombres[0],
            amount: nombres.length > 1 ? nombres[nombres.length - 1] : null,
          })
          continue
        }
      }
    }

    // Texte libre : « PIZZA MARGHERITA 12 174,00 ».
    const m = ligne.match(/^(.*?[A-Za-zÀ-ÿ].*?)\s+([\d\s.,]+?)(?:\s+([\d\s.,]+))?$/)
    if (m) {
      const label = m[1].trim()
      const q = toNum(m[2])
      if (q !== null && !estBruit(label)) {
        out.push({ label, code: null, quantity: q, amount: m[3] ? toNum(m[3]) : null })
      }
    }
  }

  return out
}

/**
 * Rapproche chaque ligne lue d'un article de la carte.
 *
 * Le code de caisse d'abord — c'est l'identifiant stable. Puis le libellé
 * exact, puis un libellé contenu dans l'autre, ce dernier cas étant signalé
 * comme approximatif : « Pizza Margherita » et « Pizza Margherita XL » sont
 * deux articles, et l'écran doit laisser trancher.
 */
export function matchLines(lines: ParsedLine[], card: CardEntry[]): MatchedLine[] {
  const parCode = new Map<string, CardEntry>()
  const parNom = new Map<string, CardEntry>()
  for (const item of card) {
    if (item.code) parCode.set(normalize(item.code), item)
    parNom.set(normalize(item.name), item)
  }

  return lines.map((l) => {
    const code = l.code ? parCode.get(normalize(l.code)) : undefined
    if (code) return { ...l, itemId: String(code.id), itemName: code.name, how: 'code' as const }

    // Le libellé peut lui-même être un code de caisse, selon l'export.
    const commeCode = parCode.get(normalize(l.label))
    if (commeCode) {
      return { ...l, itemId: String(commeCode.id), itemName: commeCode.name, how: 'code' as const }
    }

    // Sur un ticket imprimé, le code et le libellé tiennent sur la même
    // ligne : « PZ01 Pizza Margherita ». Le premier mot est alors le code, et
    // s'y fier vaut mieux qu'un rapprochement approximatif sur le reste.
    const premier = l.label.split(/\s+/)[0]
    if (premier && premier !== l.label) {
      const parPremier = parCode.get(normalize(premier))
      if (parPremier) {
        return { ...l, itemId: String(parPremier.id), itemName: parPremier.name, how: 'code' as const }
      }
    }

    const n = normalize(l.label)
    const exact = parNom.get(n)
    if (exact) return { ...l, itemId: String(exact.id), itemName: exact.name, how: 'name' as const }

    const approx = card.find((item) => {
      const c = normalize(item.name)
      return c.length > 3 && (n.includes(c) || c.includes(n))
    })
    if (approx) {
      return { ...l, itemId: String(approx.id), itemName: approx.name, how: 'approx' as const }
    }

    return { ...l, itemId: null, itemName: null, how: null }
  })
}

/** Le texte d'un fichier, quel que soit son type. */
export async function extractText(file: {
  name: string
  type: string
  buffer: ArrayBuffer
}): Promise<string> {
  const nom = file.name.toLowerCase()

  if (nom.endsWith('.pdf') || file.type === 'application/pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(new Uint8Array(file.buffer))
    const { text } = await pdfText(doc, { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : text
  }

  if (nom.endsWith('.xlsx') || nom.endsWith('.xls')) {
    // Un .xlsx est un zip de XML : on lit les chaînes partagées et les
    // cellules de la première feuille, sans dépendance de plus.
    return readXlsx(file.buffer)
  }

  // CSV et texte : l'encodage d'une caisse est souvent latin-1.
  const utf8 = new TextDecoder('utf-8').decode(file.buffer)
  // Le caractère de remplacement trahit un décodage raté.
  if (utf8.includes('�')) return new TextDecoder('windows-1252').decode(file.buffer)
  return utf8
}

/**
 * Contenu texte d'un classeur .xlsx, ligne par ligne.
 *
 * Le format est un zip de fichiers XML. Le lire à la main évite une
 * dépendance de plus pour ce seul usage, au prix d'une prise en charge
 * limitée : première feuille, valeurs brutes, pas de formules.
 */
async function readXlsx(buffer: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const zip = unzipSync(new Uint8Array(buffer))

  const sharedXml = zip['xl/sharedStrings.xml']
  const shared: string[] = []
  if (sharedXml) {
    const xml = strFromU8(sharedXml)
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(
        (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
          .map((t) => t.replace(/<[^>]+>/g, ''))
          .join('')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      )
    }
  }

  const nomFeuille = Object.keys(zip).find((k) => /^xl\/worksheets\/sheet1\.xml$/.test(k))
    ?? Object.keys(zip).find((k) => k.startsWith('xl/worksheets/'))
  if (!nomFeuille) return ''
  const feuille = strFromU8(zip[nomFeuille])

  const lignes: string[] = []
  for (const row of feuille.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = []
    for (const c of row.match(/<c[^>]*>[\s\S]*?<\/c>|<c[^>]*\/>/g) ?? []) {
      const type = c.match(/t="([^"]+)"/)?.[1]
      const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (v === undefined) {
        const inline = c.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]
        cells.push(inline ?? '')
        continue
      }
      cells.push(type === 's' ? (shared[Number(v)] ?? '') : v)
    }
    if (cells.some((x) => x !== '')) lignes.push(cells.join('\t'))
  }
  return lignes.join('\n')
}
