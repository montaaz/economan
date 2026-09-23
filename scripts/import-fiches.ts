/**
 * Importe les fiches techniques du dossier `menu` (classeurs Excel).
 *
 *   npx tsx --env-file=.env scripts/import-fiches.ts
 *
 * Chaque classeur porte des blocs : un nom de plat, puis ses ingrédients
 * (libellé, grammage, coût), parfois plusieurs blocs côte à côte. On lit les
 * blocs colonne par colonne, on crée une fiche par plat et par service, on
 * rapproche chaque ingrédient d'un article du stock quand le nom le permet,
 * et on relie la fiche au plat de la carte du même nom. Relancer l'import
 * met à jour les fiches déjà connues (même service, même nom) sans les
 * dupliquer ; ce que l'écran a corrigé à la main (article rapproché) est gardé.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) })

const normaliser = (v: string) => v.replace(/œ/g, 'oe').replace(/Œ/g, 'OE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const GRAM = /^\d+(?:[.,]\d+)?(?:\/\d+)?\s*[a-zéè]*$/i

function lireXlsx(path: string): { nom: string; lignes: string[][] }[] {
  const z = unzipSync(readFileSync(path))
  const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  const ss: string[] = []
  const ssx = z['xl/sharedStrings.xml'] ? strFromU8(z['xl/sharedStrings.xml']) : ''
  for (const m of ssx.matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
  const wb = strFromU8(z['xl/workbook.xml'])
  const noms = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => [dec(m[1]), m[2]] as const)
  const rels = strFromU8(z['xl/_rels/workbook.xml.rels'])
  const cible = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))
  return noms.map(([nom, rid]) => {
    const t = cible.get(rid)!; const chemin = t.startsWith('/') ? t.slice(1) : 'xl/' + t
    const xml = strFromU8(z[chemin]); const lignes: string[][] = []
    for (const r of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"(?: [^>]*?t="([^"]+)")?[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = c[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
        const inner = c[3] ?? ''; const val = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]; let v = ''
        if (c[2] === 's' && val !== undefined) v = ss[Number(val)] ?? ''
        else if (c[2] === 'inlineStr') v = dec([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
        else if (val !== undefined) v = val
        cells[col] = v.trim()
      }
      lignes.push(cells)
    }
    return { nom, lignes }
  })
}

// Un classeur → un service. Les préparations (pâte, sauces…) sont des
// PREPARATION ; tout le reste est un plat.
const CLASSEURS: { fichier: string; departement: string; famille: string | null; feuilles?: (nom: string) => boolean; preparations?: (feuille: string) => boolean; familleDe?: (feuille: string) => string }[] = [
  { fichier: 'fiche technique cuisine.xlsx', departement: 'Cuisine', famille: 'Cuisine' },
  { fichier: 'fiche technique pizza.xlsx', departement: 'Cuisine', famille: 'Pizzas', feuilles: (n) => !/^FICHE TECHNIQUE PIZZA$/i.test(n), preparations: (n) => /PREPARATION/i.test(n), familleDe: (n) => (/PANUZZO/i.test(n) ? 'Panuozzo' : 'Pizzas') },
  // Les portions du bar se préparent, elles ne se vendent pas telles quelles.
  { fichier: 'FICHE TECHNIQUE PORTION FRT SECS BAR.xlsx', departement: 'Bar', famille: null, preparations: () => true },
  { fichier: 'fiche technique PTTIT DEJ corrigée.xlsx', departement: 'Petit Déjeuner', famille: 'Petit déjeuner', feuilles: (n) => !/composants|signature/i.test(n) },
]
const SOUS_FEUILLES_SERVICE: Record<string, string> = { PATISSERIE: 'Pâtisserie', BAR: 'Bar' }
const EN_TETE = /^(ingr|ingredient|ingrédient)s?$/i
const GRAMMAGE = /^(grammage|gramage|dosage)$/i
const IGNORER = /^(total|cout|coût|p vente|coficien|coefficient|le \d|fiche technique|grammage|gramage|dosage|ingr|\d+([.,]\d+)?)$|^(total|cout|coût|p vente|coficien|le \d|fiche technique)/i

type Bloc = { nom: string; lignes: { label: string; brut: string; cout: number | null }[]; feuille: string }

function lireGrammage(brut: string): { quantity: number; unit: string } | null {
  const t = brut.trim().toLowerCase().replace(',', '.').replace(/\s+/g, '')
  if (!t) return null
  const m = t.match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?([a-zéè]*)$/)
  if (!m) return null
  let q = Number(m[1]); if (m[2]) q = q / Number(m[2])
  let unit = m[3] || ''
  if (unit === 'k') unit = 'kg'
  if (unit === 'gr') unit = 'g'
  if (['pc', 'pce', 'pcs', 'portion'].includes(unit)) unit = 'p'
  return Number.isFinite(q) ? { quantity: q, unit } : null
}

/** Les blocs d'une feuille : chaque en-tête « ingr | grammage » ouvre une colonne de lecture. */
function blocs(feuille: { nom: string; lignes: string[][] }): Bloc[] {
  const out: Bloc[] = []
  const L = feuille.lignes
  // Colonnes des en-têtes « ingr » : le nom du plat est à gauche (même ligne
  // ou lignes suivantes), les ingrédients dessous.
  const colonnes = new Set<number>()
  for (const l of L) l.forEach((c, i) => { if (c && EN_TETE.test(c)) colonnes.add(i) })
  if (colonnes.size === 0) {
    // Feuille sans en-tête (portions du bar) : nom en A sans B, ingrédients en A+B.
    let courant: Bloc | null = null
    for (const l of L) {
      const a = l[0] ?? '', b = l[1] ?? ''
      if (!a || IGNORER.test(a)) continue
      if (!b) { courant = { nom: a, lignes: [], feuille: feuille.nom }; out.push(courant); continue }
      if (courant) courant.lignes.push({ label: a, brut: b, cout: null })
    }
    return out
  }
  for (const col of colonnes) {
    let courant: Bloc | null = null
    let attenteNom = false
    for (const l of L) {
      const ingr = l[col] ?? '', gram = l[col + 1] ?? '', cout = l[col + 2] ?? ''
      const gauche = [l[col - 1] ?? '', l[col - 2] ?? '', l[col - 3] ?? ''].find((x) => x && !IGNORER.test(x) && !EN_TETE.test(x) && !GRAMMAGE.test(x)) ?? ''
      if (ingr && EN_TETE.test(ingr)) {
        // En-tête : le nom est à gauche sur la même ligne, sinon sur la ligne d'ingrédient qui suit.
        courant = { nom: gauche, lignes: [], feuille: feuille.nom }
        out.push(courant)
        attenteNom = !gauche
        continue
      }
      if (!courant) continue
      if (!ingr) continue
      if (IGNORER.test(ingr)) continue
      // Bloc décalé : la feuille met l'ingrédient une colonne à gauche de
      // l'en-tête (« BAR | ingr | dosage » puis « café | 1p | 0.5 »). On le
      // reconnaît à un grammage là où on attendait un libellé.
      if (GRAM.test(ingr) && gauche && !GRAM.test(gauche)) {
        courant.lignes.push({ label: gauche, brut: ingr, cout: gram && /^-?\d/.test(gram) ? Number(gram) : null })
        continue
      }
      if (attenteNom && gauche) { courant.nom = gauche; attenteNom = false }
      else if (gauche && courant.lignes.length > 0 && normaliser(gauche) !== normaliser(courant.nom)) {
        // Un nouveau plat commence sans nouvel en-tête (cuisine : nom + premier ingrédient sur la même ligne).
        courant = { nom: gauche, lignes: [], feuille: feuille.nom }; out.push(courant)
      } else if (gauche && courant.lignes.length === 0 && !courant.nom) courant.nom = gauche
      const g = gram && /\d/.test(gram) ? gram : ''
      courant.lignes.push({ label: ingr, brut: g, cout: cout && /^-?\d/.test(cout) ? Number(cout) : null })
    }
  }
  return out.filter((b) => b.nom && b.lignes.length > 0)
}

function rapprocher(label: string, produits: { id: number; name: string }[]): number | null {
  const n = normaliser(label).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!n) return null
  const exact = produits.find((p) => normaliser(p.name) === n)
  if (exact) return exact.id
  const mots = n.split(' ').filter((m) => m.length > 2)
  if (mots.length === 0) return null
  let meilleur: { id: number; score: number } | null = null
  for (const p of produits) {
    const pm = new Set(normaliser(p.name).split(/[^a-z0-9]+/).filter((m) => m.length > 2))
    const communs = mots.filter((m) => pm.has(m) || [...pm].some((x) => x.startsWith(m) || m.startsWith(x))).length
    if (communs !== mots.length) continue
    const score = 1 - Math.abs(pm.size - mots.length) * 0.05
    if (!meilleur || score > meilleur.score) meilleur = { id: p.id, score }
  }
  return meilleur && meilleur.score >= 0.6 ? meilleur.id : null
}

async function main() {
  const departements = await prisma.department.findMany({ select: { id: true, name: true } })
  const depId = (nom: string) => { const d = departements.find((x) => normaliser(x.name) === normaliser(nom)); if (!d) throw new Error(`Département introuvable : ${nom}`); return d.id }
  const produits = await prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true } })
  const items = await prisma.salesItem.findMany({ select: { id: true, name: true } })
  const familles = new Map((await prisma.salesFamily.findMany({ select: { id: true, name: true } })).map((f) => [normaliser(f.name), f.id]))
  const familleId = async (nom: string) => {
    const k = normaliser(nom); if (familles.has(k)) return familles.get(k)!
    const f = await prisma.salesFamily.create({ data: { name: nom }, select: { id: true } }); familles.set(k, f.id); return f.id
  }
  let fiches = 0, lignes = 0, rapprochees = 0, reliees = 0, crees = 0
  const preparationsConnues = await prisma.recipe.findMany({ where: { kind: 'PREPARATION' }, select: { name: true, departmentId: true } })
  const nonRapprochees = new Map<string, number>()

  for (const c of CLASSEURS) {
    const chemin = `menu/${c.fichier}`
    let feuilles: ReturnType<typeof lireXlsx>
    try { feuilles = lireXlsx(chemin) } catch (e) { console.log(`  ! ${c.fichier} illisible : ${(e as Error).message}`); continue }
    for (const f of feuilles) {
      if (c.feuilles && !c.feuilles(f.nom)) continue
      const dep = SOUS_FEUILLES_SERVICE[f.nom.toUpperCase()] ? depId(SOUS_FEUILLES_SERVICE[f.nom.toUpperCase()]) : depId(c.departement)
      const kind = c.preparations?.(f.nom) ? 'PREPARATION' : 'PLAT'
      // Un même nom dans plusieurs feuilles d'un classeur : la première l'emporte.
      const vus = new Set<string>()
      for (const b of blocs(f)) {
        const nom = b.nom.replace(/\s+/g, ' ').trim()
        const cle = normaliser(nom)
        if (vus.has(cle)) continue
        vus.add(cle)
        const source = `${c.fichier} / ${f.nom}`
        // Préparation ou plat : une pâte, une sauce, une crème… ne se vend pas.
        const estPrep = kind === 'PREPARATION' || /^(patte|pate|pâte|sauce|creme|crème|sirop|caramel)\b/i.test(nom)
        const existante = await prisma.recipe.findUnique({ where: { departmentId_name: { departmentId: dep, name: nom } }, include: { lines: true } })
        let salesItemId = existante?.salesItemId ?? items.find((i) => normaliser(i.name) === cle)?.id ?? null
        // Un plat sans article de carte : on le crée, dans la famille du
        // classeur, au service de la fiche — c'est lui que le Z comptera.
        const familleNom = c.familleDe ? c.familleDe(f.nom) : c.famille
        if (!estPrep && salesItemId === null && familleNom) {
          const dejaLie = await prisma.recipe.findFirst({ where: { salesItem: { name: { equals: nom, mode: 'insensitive' } } }, select: { id: true } })
          if (!dejaLie) {
            const item = await prisma.salesItem.create({ data: { name: nom, familyId: await familleId(familleNom), departmentId: dep }, select: { id: true, name: true } })
            items.push(item); salesItemId = item.id; crees++
          }
        }
        const recipe = existante
          ? await prisma.recipe.update({ where: { id: existante.id }, data: { source, kind: estPrep ? 'PREPARATION' : 'PLAT', salesItemId }, select: { id: true } })
          : await prisma.recipe.create({ data: { name: nom, departmentId: dep, kind: estPrep ? 'PREPARATION' : 'PLAT', source, salesItemId }, select: { id: true } })
        fiches++; if (salesItemId) reliees++
        const anciennes = new Map((existante?.lines ?? []).map((l) => [normaliser(l.label), l]))
        await prisma.recipeLine.deleteMany({ where: { recipeId: recipe.id } })
        let i = 0
        for (const l of b.lignes) {
          const g = lireGrammage(l.brut) ?? { quantity: 1, unit: 'p' }
          const ancienne = anciennes.get(normaliser(l.label))
          // Une correction faite à l'écran prime sur le rapprochement automatique ;
          // et un libellé qui désigne une préparation du service (« pate » →
          // « patte pizza ») ne doit pas tomber sur un article approchant.
          const prepDuService = preparationsConnues.find((x) => x.departmentId === dep && normaliser(x.name) !== cle && (normaliser(x.name) === normaliser(l.label) || normaliser(x.name).split(' ')[0].replace(/tt/, 't') === normaliser(l.label).split(' ')[0].replace(/tt/, 't')))
          const productId = ancienne?.productId ?? (prepDuService ? null : rapprocher(l.label, produits))
          if (productId) rapprochees++; else nonRapprochees.set(l.label, (nonRapprochees.get(l.label) ?? 0) + 1)
          await prisma.recipeLine.create({ data: { recipeId: recipe.id, label: l.label, quantity: g.quantity, unit: g.unit, productId, subRecipeId: ancienne?.subRecipeId ?? null, cost: l.cout, sortOrder: i++ } })
          lignes++
        }
      }
    }
  }
  // Les préparations utilisées comme ingrédient : « pate 300g » → la fiche « patte pizza ».
  const preps = await prisma.recipe.findMany({ where: { kind: 'PREPARATION' }, select: { id: true, name: true, departmentId: true } })
  const orphelines = await prisma.recipeLine.findMany({ where: { subRecipeId: null }, select: { id: true, label: true, productId: true, recipe: { select: { departmentId: true, name: true } } } })
  let sous = 0
  const racine = (v: string) => normaliser(v).replace(/\s+/g, ' ').split(' ')[0].replace(/tt/, 't')
  for (const l of orphelines) {
    const n = normaliser(l.label).replace(/\s+/g, ' ')
    const p = preps.find((x) => x.departmentId === l.recipe.departmentId && normaliser(x.name) !== normaliser(l.recipe.name)
      && (normaliser(x.name) === n || normaliser(x.name).startsWith(n + ' ') || (racine(x.name) === racine(l.label) && racine(l.label).length > 3)))
    if (p) { await prisma.recipeLine.update({ where: { id: l.id }, data: { subRecipeId: p.id, productId: null } }); sous++; nonRapprochees.delete(l.label) }
  }
  console.log(`fiches : ${fiches} (${reliees} reliées à la carte, ${crees} articles de carte créés) ; lignes : ${lignes} ; articles rapprochés : ${rapprochees} ; préparations reliées : ${sous}`)
  const restantes = [...nonRapprochees.entries()].sort((a, b) => b[1] - a[1])
  console.log(`ingrédients sans article (${restantes.length}) : ${restantes.slice(0, 40).map(([l, n]) => `${l}×${n}`).join(', ')}${restantes.length > 40 ? ' …' : ''}`)
}
main().finally(() => prisma.$disconnect())
