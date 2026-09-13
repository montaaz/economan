# Economan 2 — Commandes par département

Prise de commande par département, traitement par l'économat, bons de livraison
et confirmation de réception. Next.js 16 · GraphQL · PostgreSQL · Prisma 7.

---

## Démarrage

```bash
npm install
npx prisma migrate deploy        # crée le schéma
npm run db:import                # reprend le catalogue depuis la base `economan`
npx tsx prisma/assign-categories.ts   # donne à chaque département sa feuille
npm run dev
```

L'application écoute sur <http://localhost:3000>.

### Base de données

`DATABASE_URL` pointe sur `postgresql://postgres:postgres@localhost:5432/debout`.
Toutes les clés primaires sont des entiers auto-incrémentés (`serial`).

### Comptes (mot de passe commun : `Economan2026!`)

| Identifiant    | Rôle          | Département  |
| -------------- | ------------- | ------------ |
| `admin`        | Administrateur| —            |
| `economat`     | Économat      | —            |
| `bar`          | Employé       | Bar          |
| `cuisine`      | Employé       | Cuisine      |
| `patisserie`   | Employé       | Pâtisserie   |
| `restaurant`   | Employé       | Restaurant   |
| `housekeeping` | Employé       | Housekeeping |

Le département **Chicha** existe sans agent : créez-en un depuis
Administration → Utilisateurs.

---

## Les trois parcours

### 1. Employé

`/` → carte du département → choix de l'agent → mot de passe **ou empreinte**.

- **Nouvelle commande** — toute la feuille du département s'affiche, un article
  par ligne. **Chaque ligne doit être renseignée** avant l'envoi ; `0` est une
  réponse valide, mais une ligne à 0 n'est pas enregistrée. Le bouton
  « Mettre 0 aux lignes vides » traite le cas courant d'un coup.
- **Mes commandes** — les 3 derniers jours, groupés par journée.
- Quand une commande est livrée, un bouton **« J'ai reçu ma commande »**
  la clôt.

### 2. Économat — `/economat/login`

- **Commandes du jour** — les tickets groupés par département, avec le total
  de chaque département et le total général en pied.
- Sur un ticket : **Accepter**, puis sur chaque ligne
  **valider** (vert) · **ajuster** la quantité (orange) · **rupture** (rouge,
  avec motif). Les lignes non touchées sont servies telles que demandées.
- **Émettre le bon de livraison** fige les quantités servies et passe la
  commande en « Livrée ». **Imprimer** sort le bon avec les signatures.

### 3. Administrateur — `/admin/login`

- **Tableau de bord** — la journée d'abord, puis chaque département, ses
  tickets en cartes, son total, et le total général.
- **Départements** — créer, renommer, recolorier, masquer ou supprimer.
- **Affectations** — cocher les catégories que chaque département peut
  commander. C'est ce qui définit sa feuille d'articles.
- **Utilisateurs** — comptes, rôles, rattachement, mots de passe.

---

## Connexion par empreinte (WebAuthn)

1. Se connecter avec son mot de passe.
2. **Mon compte → Ajouter cet appareil**, puis valider avec le doigt ou le visage.
3. À la connexion suivante, le bouton **« Se connecter par empreinte »** apparaît
   sur cet appareil.

Le capteur exige un contexte sécurisé : `localhost` en développement, **HTTPS**
en production. En production, renseigner :

```bash
WEBAUTHN_RP_ID=commandes.mon-domaine.tn      # le domaine, sans protocole ni port
WEBAUTHN_ORIGIN=https://commandes.mon-domaine.tn
```

---

## Modèle de données

```
Department ──< DepartmentCategory >── Category ──< Product
     │                                              │
     └──< User ──< Order ──< OrderLine >────────────┘
```

Un département voit un article si la **catégorie** de cet article lui est
affectée. Ce contrôle est appliqué deux fois : au chargement du catalogue, et à
nouveau à l'enregistrement de la commande, pour qu'un client modifié ne puisse
pas commander hors de son périmètre.

### Performance

- Index composites sur tous les chemins de lecture chauds :
  `products(categoryId, isActive, sortOrder)`, `orders(businessDay, departmentId, ticketNumber)`,
  `orders(createdById, createdAt)`, `order_lines(orderId, sortOrder)`.
- Numérotation des tickets par `INSERT … ON CONFLICT DO UPDATE` sur
  `ticket_counters` : atomique, sans verrou de table, deux commandes simultanées
  ne peuvent pas réclamer le même numéro.
- Les libellés d'article sont figés sur la ligne de commande, pour qu'un bon
  ancien reste lisible après un renommage au catalogue.
- Les Server Components exécutent GraphQL **en process** (`executeGraphQL`) —
  mêmes resolvers et mêmes gardes que l'endpoint HTTP, sans aller-retour réseau.
- Rendu plafonné à 40 lignes avec « Afficher plus », pour que 550 articles
  restent fluides sur un téléphone.

Mesures sur le jeu de données réel (544 articles) :

| Requête                          | Temps   |
| -------------------------------- | ------- |
| Catalogue d'un département       | 0,15 ms |
| Tableau d'une journée            | 0,04 ms |

---

## Déploiement (Vercel)

Le client Prisma n'est pas versionné : il est régénéré par le `postinstall`
(`prisma generate`), et de nouveau au build. Aucune configuration
supplémentaire n'est nécessaire côté commande de build.

### Variables d'environnement à renseigner

| Variable            | Obligatoire | Valeur                                                     |
| ------------------- | ----------- | ---------------------------------------------------------- |
| `DATABASE_URL`      | oui         | URL Postgres accessible depuis l'extérieur (voir plus bas)  |
| `AUTH_SECRET`       | oui         | `openssl rand -base64 32` — une valeur unique, jamais celle d'un exemple |
| `AUTH_TRUST_HOST`   | oui         | `true`                                                      |
| `WEBAUTHN_RP_ID`    | pour l'empreinte | le domaine seul, ex. `economan.vercel.app` (ni protocole, ni port) |
| `WEBAUTHN_ORIGIN`   | pour l'empreinte | l'URL complète, ex. `https://economan.vercel.app`      |
| `WEBAUTHN_RP_NAME`  | non         | nom affiché lors de l'enrôlement                            |
| `DATABASE_POOL_MAX` | non         | taille du pool par instance (défaut : 3 en serverless)      |

**`localhost` ne fonctionne pas en ligne.** La base doit être joignable depuis
Internet — Neon, Supabase, Railway ou un Postgres managé. Derrière un pooler
(PgBouncer, Supabase), utiliser l'URL de *pooling* fournie par l'hébergeur.

### Après le premier déploiement

```bash
DATABASE_URL="<url de production>" npx prisma migrate deploy
DATABASE_URL="<url de production>" npm run db:import          # catalogue
DATABASE_URL="<url de production>" npx tsx prisma/assign-categories.ts
```

L'import lit la base source `economan` ; sans elle, créez départements,
catégories et articles depuis l'interface d'administration.

### Empreinte digitale en production

WebAuthn exige HTTPS — ce que Vercel fournit. Il faut simplement que
`WEBAUTHN_RP_ID` corresponde exactement au domaine servi : une empreinte
enrôlée sur `economan.vercel.app` ne fonctionnera pas sur un domaine
personnalisé ajouté plus tard, elle devra être ré-enrôlée.

---

## Scripts

| Commande                              | Rôle                                        |
| ------------------------------------- | ------------------------------------------- |
| `npm run dev`                          | Serveur de développement                    |
| `npm run build`                        | Build de production                         |
| `npm run typecheck`                    | Vérification TypeScript                     |
| `npm run db:import`                    | Reprend le catalogue depuis `economan`      |
| `npx tsx prisma/assign-categories.ts`  | Affecte les catégories par département      |
| `npx tsx scripts/test-flow.ts`         | Test du parcours complet (19 contrôles)     |
| `npx tsx scripts/shots.ts`             | Captures mobile / tablette / bureau         |

---

## Responsive

Un seul jeu d'écrans à toutes les tailles :

- **Téléphone** (< 640 px) — menu en tiroir, barre de navigation basse, tableaux
  à défilement horizontal dans leur conteneur. Les champs font 16 px pour que
  iOS ne zoome pas au focus.
- **Tablette** (640–1024 px) — grilles à deux colonnes, tiroir conservé.
- **Bureau** (≥ 1024 px) — barre latérale fixe, grilles à trois colonnes.
