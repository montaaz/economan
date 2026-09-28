/**
 * La carte de vente, telle que le menu papier l'écrit.
 *
 *   npx tsx --env-file=.env scripts/import-carte-menu.ts          (aperçu)
 *   npx tsx --env-file=.env scripts/import-carte-menu.ts --apply  (écrit)
 *
 * Relu sur les neuf pages du menu (menu/WhatsApp … .jpeg). Chaque ligne
 * retrouve l'article existant qui lui ressemble — de préférence celui qui
 * porte une fiche technique — et lui pose son prix et son service ; une
 * ligne sans correspondance crée l'article dans sa famille. Relançable :
 * rien n'est créé deux fois, les noms existants restent tels quels.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) })
const APPLY = process.argv.includes('--apply')

const BAR = 21, CUISINE = 22, PATISSERIE = 23, PDJ = 27

type Item = { name: string; price: number; match?: string[] }
type Family = { name: string; dep: number; items: Item[] }

const MENU: Family[] = [
  { name: 'Petit déjeuner', dep: PDJ, items: [
    { name: 'Le Bonjour du Bey', price: 12.5, match: ['le bonjoure du bey'] },
    { name: 'Le Plaisir du Bey', price: 34, match: ['assiette sucrée(plaisire)'] },
    { name: 'El Baldy Bey', price: 34 },
    { name: "L'Énergie du Bey", price: 35 },
    { name: 'La Saveur du Bey', price: 36, match: ['la saveur du bey'] },
    { name: 'Trio Premium Signature du Bey', price: 96, match: ['tri'] },
  ] },
  { name: 'Suppléments petit déjeuner', dep: PDJ, items: [
    { name: 'Mlawi', price: 1.8 },
    { name: 'Cake', price: 3 },
    { name: 'Croissant nature', price: 4 },
    { name: 'Pain au chocolat', price: 4.5 },
    { name: 'Yaourt glacé', price: 5, match: ['yaourt glace'] },
    { name: 'Ojja chevrette', price: 13, match: ['ojja dej'] },
    { name: 'Croissant Dubaï', price: 14, match: ['croissant dubai'] },
    { name: 'Kleya', price: 15 },
  ] },
  { name: 'Cafés', dep: BAR, items: [
    { name: 'Expresso', price: 6, match: ['Café express'] },
    { name: 'Expresso américain', price: 6.5 },
    { name: 'Capucin', price: 6.5 },
    { name: 'Chocolat au lait', price: 7 },
    { name: 'Café crème', price: 7.5 },
    { name: 'Capucin Nestlé', price: 8.5 },
    { name: 'Café crème Nestlé', price: 9 },
    { name: 'Café liégeois', price: 14 },
    { name: 'Café pistache', price: 16 },
    { name: 'Cappuccino', price: 6.5, match: ['Cappuccino'] },
  ] },
  { name: 'Nespresso', dep: BAR, items: [
    { name: 'Nespresso expresso', price: 8 },
    { name: 'Nespresso expresso américain', price: 9.5 },
    { name: 'Nespresso capucin', price: 9.5 },
    { name: 'Nespresso café crème', price: 10.5 },
  ] },
  { name: 'Turkish coffee', dep: BAR, items: [
    { name: "L'Instant du Bey", price: 16 },
  ] },
  { name: 'Thé', dep: BAR, items: [
    { name: 'Thé à la menthe fraîche', price: 6 },
    { name: 'Thé infusion', price: 7 },
    { name: 'Thé aux amandes', price: 11.5 },
    { name: 'Thé aux pignons', price: 13, match: ['PORTIONS PIGNONS'] },
    { name: 'Signature Gourmande Bey', price: 20 },
  ] },
  { name: 'Chocolats & douceurs', dep: BAR, items: [
    { name: 'Chocolat chaud', price: 14 },
    { name: 'Chocolat à la crème chantilly', price: 15.5 },
    { name: 'Chocolat chaud noisette', price: 17.5 },
    { name: 'Chocolat chaud caramel beurre salé', price: 17 },
    { name: 'Chocolat chaud spéculoos', price: 18 },
  ] },
  { name: 'Iced coffee', dep: BAR, items: [
    { name: 'Iced coffee', price: 14 },
    { name: 'Iced Spanish latte', price: 15 },
    { name: 'Iced salted caramel latte', price: 16.5 },
    { name: 'Iced hazelnut latte', price: 16 },
    { name: 'Iced tiramisu latte', price: 16 },
    { name: 'Iced Nutella latte', price: 18 },
  ] },
  { name: 'Café aromatisé', dep: BAR, items: [
    { name: 'Café caramel', price: 11 },
    { name: 'Café noisette', price: 11 },
    { name: 'Café vanille', price: 11 },
    { name: 'Café tiramisu', price: 11 },
    { name: 'Café cookies', price: 11 },
    { name: 'Café spéculoos', price: 12 },
    { name: 'Café Nutella', price: 13 },
  ] },
  { name: 'Pause fraîcheur', dep: BAR, items: [
    { name: 'Eau minérale 0.4L', price: 2.5 },
    { name: 'Eau minérale ou gazéifiée', price: 5 },
    { name: 'Soda', price: 6 },
    { name: 'Citronnade', price: 10 },
    { name: 'Lemon mint', price: 11 },
    { name: 'Energy drink', price: 12 },
    { name: 'Citronnade aux amandes', price: 13.5 },
    { name: 'Limonana', price: 14.5 },
  ] },
  { name: 'Fruits & fraîcheurs', dep: BAR, items: [
    { name: 'Jus fraise', price: 13 },
    { name: 'Jus banane', price: 15 },
    { name: 'Jus kiwi', price: 17 },
    { name: 'Jus mangue', price: 19 },
  ] },
  { name: 'Cocktails & slushy', dep: BAR, items: [
    { name: 'Evasion', price: 17 },
    { name: 'Oasis', price: 18.5 },
    { name: 'Passion', price: 21 },
    { name: 'Eclat', price: 20 },
  ] },
  { name: 'Frappuccino', dep: BAR, items: [
    { name: 'Frappuccino vanille', price: 16 },
    { name: 'Frappuccino noisette', price: 17 },
    { name: 'Frappuccino tiramisu', price: 17 },
    { name: 'Frappuccino Nutella', price: 20 },
    { name: 'Frappuccino caramel beurre salé', price: 19 },
  ] },
  { name: 'Affogato', dep: BAR, items: [
    { name: 'Affogato vanille', price: 15 },
    { name: 'Affogato pistache', price: 19 },
  ] },
  { name: 'Protéine shake', dep: BAR, items: [
    { name: 'Energie', price: 21 },
    { name: 'Power Spanish', price: 22 },
    { name: 'Starter', price: 23 },
  ] },
  { name: 'Smoothies', dep: BAR, items: [
    { name: 'Bleu Hawaï', price: 17 },
    { name: 'Strawberry smoothie', price: 18 },
    { name: 'Banane kiwi', price: 18 },
    { name: 'Pina colada smoothie', price: 18 },
    { name: 'Mangue smoothie', price: 19 },
    { name: 'Fruits de bois smoothie', price: 19 },
    { name: 'Tropical', price: 20 },
  ] },
  { name: 'Mojitos', dep: BAR, items: [
    { name: 'Mojito virgin', price: 17 },
    { name: 'Mojito apple', price: 18 },
    { name: 'Mojito deep blue', price: 17 },
    { name: 'Mojito passion fruit', price: 18 },
    { name: 'Mojito framboise', price: 18 },
    { name: 'Mojito pina colada', price: 19 },
    { name: 'Mojito énergétique', price: 19 },
  ] },
  { name: 'Milkshake crunchy', dep: BAR, items: [
    { name: 'Milkshake strawberry', price: 17 },
    { name: 'Milkshake Snickers', price: 18 },
    { name: 'Milkshake Oreo', price: 18 },
    { name: 'Milkshake spéculoos', price: 18 },
    { name: 'Milkshake Nutella', price: 20 },
    { name: 'Milkshake Ferrero Rocher', price: 20 },
    { name: 'Milkshake Signature Business Bey', price: 25 },
  ] },
  { name: 'Cocktail énergétique', dep: BAR, items: [
    { name: 'Bleu passion énergétique', price: 18 },
    { name: 'Black énergétique', price: 18 },
    { name: 'Orangey', price: 19 },
  ] },
  { name: 'Cocktail drink', dep: BAR, items: [
    { name: 'Bleu sea', price: 17 },
    { name: 'Brico', price: 17 },
    { name: 'Dark red', price: 19 },
  ] },
  { name: 'Yaourt glacé', dep: BAR, items: [
    { name: 'Yaourt glacé Nutella', price: 17 },
    { name: 'Yaourt glacé fruits de saison', price: 18 },
    { name: 'Yaourt glacé fruits de bois', price: 20 },
    { name: 'Yaourt glacé pistache', price: 22 },
  ] },
  { name: 'Jwejem', dep: BAR, items: [
    { name: 'Jwejem classique', price: 21 },
    { name: 'Jwejem El Bey', price: 25 },
  ] },
  { name: 'Desserts', dep: PATISSERIE, items: [
    { name: 'Sorbet citron', price: 10 },
    { name: 'Glace 2 boules', price: 14 },
    { name: 'Glace 3 boules', price: 17 },
    { name: 'Chocomisu', price: 18 },
    { name: 'Trileçe', price: 20, match: ['trileçe'] },
    { name: 'Fondant au chocolat', price: 17 },
    { name: 'Saint Sebastian caramel', price: 22 },
    { name: 'Saint Sebastian Nutella', price: 25 },
    { name: 'Saint Sebastian pistache royal', price: 28 },
    { name: 'Assiette de fruits (2 pers.)', price: 40 },
  ] },
  { name: 'Assortiment Melt Me Up', dep: PATISSERIE, items: [
    { name: 'Box Melt Me Up (2 pers.)', price: 37 },
    { name: 'Box Melt Me Up (4 pers.)', price: 68 },
  ] },
  { name: 'Pain perdu', dep: PATISSERIE, items: [
    { name: 'Douceur dorée', price: 25 },
    { name: "Chocolat d'amour", price: 27 },
    { name: 'Douceur de Paris', price: 28 },
    { name: 'Velour vert', price: 30 },
  ] },
  { name: 'Pancake', dep: PATISSERIE, items: [
    { name: 'Cœur fondant', price: 20 },
    { name: 'Choco croquant', price: 24 },
    { name: 'Banane caramel', price: 24 },
    { name: 'Kinder dream', price: 25 },
    { name: 'Jardin pistaché', price: 30 },
    { name: 'Plaisir rouge', price: 30 },
  ] },
  { name: 'Crêpe & gaufre', dep: PATISSERIE, items: [
    { name: 'Crêpe Nutella', price: 19 },
    { name: 'Crêpe Nutella banane', price: 23 },
    { name: 'Crêpe Nutella fruits secs', price: 24 },
    { name: 'Crêpe crunchy noisette', price: 25 },
    { name: 'Crêpe brownies choco roll', price: 26 },
    { name: 'Crêpe Dubaï', price: 28 },
  ] },
  { name: 'Crêpe salée', dep: CUISINE, items: [
    { name: 'Crêpe jambon fromage', price: 19 },
    { name: 'Crêpe thon fromage', price: 20 },
    { name: 'Crêpe tunisienne', price: 21 },
    { name: 'Crêpe poulet champignon', price: 26 },
  ] },
  { name: 'Omelette', dep: CUISINE, items: [
    { name: 'Omelette végétarienne', price: 13 },
    { name: 'Omelette fromage', price: 12 },
    { name: 'Omelette thon fromage', price: 15 },
    { name: 'Omelette jambon', price: 14 },
  ] },
  { name: 'Pizzas', dep: CUISINE, items: [
    { name: 'Margherita', price: 20, match: ['pizza margharitta'] },
    { name: 'Neptune', price: 24, match: ['pizza neptune'] },
    { name: 'Pepperoni', price: 25, match: ['pizza peppironi'] },
    { name: 'Végétarienne', price: 23, match: ['pizza vigetarienne'] },
    { name: 'Reggina', price: 26, match: ['pizza reggina'] },
    { name: '4 saisons', price: 26, match: ['pizza 4 saison'] },
    { name: 'Primavera', price: 30, match: ['pizza primavéra'] },
    { name: '4 fromages', price: 28, match: ['pizza 4 fromage'] },
    { name: 'Poulet crunchy', price: 33, match: ['pizza poulet crunchy'] },
    { name: 'Fruits de mer', price: 35, match: ['pizza fruit de mer'] },
    { name: 'Saumon', price: 39, match: ['pizza saumon'] },
  ] },
  { name: 'Panuozzo', dep: CUISINE, items: [
    { name: 'Grill chicken panozzo', price: 23, match: ['panuozzo grille chiken'] },
    { name: 'Crunchy chicken panozzo', price: 25 },
    { name: 'Mexicain panozzo', price: 27, match: ['panuozzo mexicain'] },
    { name: 'Poulet à la crème panozzo', price: 26, match: ['panuozzo poulet a la créme'] },
    { name: 'Jambon fumé panozzo', price: 21, match: ['panuozzo jambon fume'] },
  ] },
  { name: 'Fraîcheur du Bey', dep: CUISINE, items: [
    { name: 'Salade César', price: 26, match: ['salade césar'] },
    { name: 'Salade fruit de mer', price: 37, match: ['salade fruit fe mer'] },
    { name: 'Salade tropicale', price: 45, match: ['salade tropical'] },
    { name: 'Carpaccio de poulpe', price: 39, match: ['CARPACCIO POULPE'] },
    { name: 'Carpaccio poulet fumé', price: 28, match: ['CARPACCIO POULET FUME'] },
  ] },
  { name: 'Chaleur du Bey', dep: CUISINE, items: [
    { name: 'Brik aux thon', price: 8, match: ['BRIKI AUX THON'] },
    { name: 'Brik aux chevrettes', price: 10, match: ['BRIK AUX CHEVRETTE'] },
    { name: 'Gratin fruits de mer', price: 34, match: ['GRATIN FRUIT FE MER'] },
    { name: 'Émincé de poulet façon du Bey', price: 27, match: ['EMINCE DE POULET AU Façon DU CHEF'] },
    { name: 'Ojja merguez', price: 28, match: ['OJJA MERGUEZ'] },
    { name: 'Ojja chevrettes', price: 33, match: ['OJJA CHEVRETTE'] },
  ] },
  { name: 'Pasta du Bey', dep: CUISINE, items: [
    { name: "Fell souris d'agneau", price: 63, match: ["fell souri d'agneau"] },
    { name: 'Spaghetti bolognaise', price: 32, match: ['SPAGHETTE BOLONAISE'] },
    { name: 'Tagliatelle Alfredo', price: 28.5, match: ['TAGLIATELLI ALFREDO'] },
    { name: "Spaghetti fruits de mer à l'italienne", price: 48, match: ['SPAGHETTI FRUIT DE MER A LITALIENNE'] },
    { name: 'Spaghetti fruits de mer sauce rouge', price: 47, match: ['SPAGHETTI FRUIT DE MER SAUCE ROUGE'] },
    { name: 'Penne saumon sauce rosée', price: 36, match: ['PENNEE SAUMON SAUCE RAUSE'] },
    { name: 'Ravioli épinard ricotta sauce blanche', price: 21, match: ['RAVIOLLI RIGOUTA EPINARD'] },
    { name: 'Ravioli au saumon sauce rosée', price: 27, match: ['RAVIOLLI SAUMON SAUCE RAUSE'] },
    { name: 'Ravioli bolognaise sauce rouge', price: 23, match: ['RAVIOLLI BOLONAISE'] },
    { name: 'Tagliatelle au poulet pané sauce pesto', price: 31, match: ['TAGLIATELLI POULET PANNE SAUSE PISTO'] },
  ] },
  { name: 'Risotto du Bey', dep: CUISINE, items: [
    { name: 'Risotto poulet sauce rosée', price: 34.5, match: ['RISOTTO POULET SAUCE ROSE'] },
    { name: 'Risotto chevrette et boutargue sauce pesto', price: 44, match: ['RISOTTO CHEVRETTE SAUCE PISTO AU BOUTARG'] },
    { name: 'Risotto fruit de mer sauce blanche', price: 48, match: ['RISOTTO FRUIT DE MER SAUCE BLANCHE'] },
  ] },
  { name: 'Volaille du Bey', dep: CUISINE, items: [
    { name: 'Escalope de poulet grillée', price: 27.5, match: ['ESCALOPE GRILLEE'] },
    { name: 'Escalope de poulet à la crème', price: 29.5, match: ['ESCALOPE A LA CREME'] },
    { name: 'Filet de poulet crunchy', price: 28.5, match: ['FILET DE POULET CRAUNCHY'] },
    { name: 'Suprême de poulet farci', price: 37.5, match: ['SUPREME DE POULET FARCI'] },
    { name: 'Cordon bleu fait maison', price: 34.5, match: ['CORDON BLEU'] },
  ] },
  { name: 'Viande du Bey', dep: CUISINE, items: [
    { name: "Souris d'agneau à l'anglaise", price: 66.5, match: ["SOURI D'AGNEAU A LANGLAISE"] },
    { name: 'Filet Wellington', price: 65, match: ['FILET WILINGTON'] },
    { name: 'Escalope de bœuf pané sauce parmesan', price: 60, match: ['ESCALOPE DE BŒUF PANNEE SAUCE PARMAISON'] },
    { name: 'Émincé de bœuf Strogonoff', price: 47, match: ['EMINCI DE BŒUF STROGANOF'] },
    { name: 'Filet de bœuf sauce aux choix', price: 59, match: ['FILET DE BŒUF SAUCE CHOIX'] },
    { name: 'Tornado de veau en croûte de parmesan', price: 63, match: ['TORNADO AU CROUTE PARMAISON'] },
  ] },
  { name: 'Les trésors marins du Bey', dep: CUISINE, items: [
    { name: 'Sauté fruits de mer', price: 56, match: ['SAUTTE FRUIT DE MER'] },
    { name: 'Plat daurade grillée', price: 32, match: ['DAURADE GRILLEE'] },
    { name: 'Plat loup grillé', price: 33, match: ['LOUP GRILLEE'] },
    { name: 'Crevette grillée', price: 44, match: ['CREVETTE GRILLEE'] },
    { name: 'Loup farci', price: 45, match: ['LOUP FARCI AU Façon du chef'] },
    { name: 'Crevette à la crème', price: 46, match: ['CREVETTE A LA CREME'] },
    { name: 'Le Trésor du Bey (2 pers.)', price: 174, match: ['CARNAVAL DE BEY'] },
  ] },
]

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim()

async function main() {
  const familles = await prisma.salesFamily.findMany({ include: { items: { include: { recipe: { select: { id: true } } } } } })
  const tous = familles.flatMap((f) => f.items.map((i) => ({ ...i, familyName: f.name })))
  const parNom = new Map(tous.map((i) => [norm(i.name), i]))
  let lies = 0, crees = 0, prix = 0
  const rapport: string[] = []
  for (const fam of MENU) {
    let famille = familles.find((f) => norm(f.name) === norm(fam.name)) ?? null
    for (const it of fam.items) {
      // Correspondance : les alias explicites d'abord, puis le nom du menu tel quel.
      const cles = [...(it.match ?? []), it.name].map(norm)
      let existant = null as (typeof tous)[number] | null
      for (const c of cles) { const e = parNom.get(c); if (e) { existant = e; break } }
      if (existant) {
        lies += 1
        const changePrix = existant.price === null || Number(existant.price) !== it.price
        if (changePrix) prix += 1
        rapport.push(`= ${it.name} → « ${existant.name} » (${existant.familyName}${existant.recipe ? ', fiche' : ''}) : ${existant.price === null ? '—' : Number(existant.price)} → ${it.price} DT`)
        if (APPLY) await prisma.salesItem.update({ where: { id: existant.id }, data: { price: it.price, ...(existant.departmentId === null && { departmentId: fam.dep }) } })
        continue
      }
      crees += 1
      rapport.push(`+ ${it.name} (${fam.name}) ${it.price} DT · d${fam.dep}`)
      if (APPLY) {
        if (!famille) {
          famille = { ...(await prisma.salesFamily.create({ data: { name: fam.name, sortOrder: familles.length + MENU.indexOf(fam) } })), items: [] } as unknown as (typeof familles)[number]
          familles.push(famille!)
        }
        const cree = await prisma.salesItem.create({ data: { familyId: famille!.id, name: it.name, price: it.price, departmentId: fam.dep } })
        parNom.set(norm(it.name), { ...cree, recipe: null, familyName: fam.name } as (typeof tous)[number])
      }
    }
  }
  console.log(rapport.join('\n'))
  console.log(`\n${APPLY ? 'ÉCRIT' : 'APERÇU'} : ${lies} article(s) retrouvé(s) (${prix} prix posés), ${crees} à créer.`)
}
main().finally(() => prisma.$disconnect())
