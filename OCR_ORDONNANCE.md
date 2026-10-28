# Lire l'ordonnance automatiquement

## D'abord, une confusion à lever : le Zebra SE2707 ne fait pas d'OCR

Le **SE2707 est un lecteur de codes-barres** (1D et 2D : QR, DataMatrix, EAN). Il lit des codes, pas
des mots. Mis devant une ordonnance, il ne rendra rien — il n'y a pas de code-barres dessus.

Ce n'est pas un détail de vocabulaire, parce que les deux choses coûtent et apportent des choses
très différentes :

| | Lecteur de codes-barres | OCR |
|---|---|---|
| Lit | un code imprimé exprès | du texte écrit pour des humains |
| Sur une ordonnance | rien | les valeurs, si elle est imprimée |
| Fiabilité | quasi parfaite, par construction | variable, et c'est tout le problème |
| Matériel | un module à acheter | aucun : du logiciel |

Un lecteur de codes-barres deviendrait utile le jour où **nous** imprimons quelque chose : un QR
code sur le reçu de commande, que le client présente au retrait. Là, c'est le bon outil. Pour lire
l'ordonnance d'un ophtalmologiste, non.

## Ce que fait la borne aujourd'hui

Elle **photographie** l'ordonnance et vérifie que la photo est **lisible** — une feuille est bien
là, le texte a des lignes nettes, ni flou ni reflet ni obscurité (voir `ordonnance.js`). Si ce n'est
pas lisible, le client recommence ; il ne peut pas passer outre.

Ensuite la photo part à l'opticien, qui **lit les valeurs à la main** sur le tableau de bord. C'est
cette saisie-là que l'OCR peut faire gagner.

## La règle qui commande tout le reste

**L'OCR propose, l'opticien confirme. Jamais de commande automatique.**

Une sphère lue −2,75 au lieu de −2,25 donne une paire inutilisable : refaite aux frais de la
boutique, et un client qui ne voit pas en attendant. Un module qui se trompe une fois sur cinquante
coûte plus cher que la saisie qu'il remplace. Donc : les valeurs s'affichent **à côté de la photo**,
l'opticien les valide ou les corrige d'un geste, et rien ne part sans lui.

Le corollaire, c'est que le module doit **refuser** plutôt que deviner. C'est ce qui est écrit dans
`ordonnance-lecture.js` : une valeur hors grammaire optique n'est pas arrondie, elle est rejetée
avec sa raison. Arrondir transformerait une erreur visible en erreur invisible.

## Ce qui est construit et mesuré

`ordonnance-lecture.js` prend le texte d'un OCR et en tire les valeurs. Sa sécurité tient à la
grammaire très étroite d'une ordonnance :

- sphère et cylindre sont des **multiples de 0,25**, sans exception ;
- l'axe est un **entier de 0 à 180** ;
- l'addition est **positive**, entre +0,50 et +4,00 ;
- l'écart pupillaire est entre 45 et 80 mm.

Un nombre hors de là n'est pas une ordonnance inhabituelle : c'est une erreur de lecture. Les
confusions classiques de l'OCR sur des chiffres (O pour 0, I pour 1, S pour 5) sont corrigées
avant, puis la grammaire tranche.

### Ce que donne une vraie chaîne OCR

Mesuré en lançant un moteur OCR réel (Tesseract, français) sur des ordonnances imprimées de trois
mises en page différentes :

| Mise en page | Sphère, cylindre, axe | Addition | Écart pupillaire | Valeur fausse ? |
|---|---|---|---|---|
| lignes étiquetées (`OD : Sph −2,25 Cyl −0,75 Axe 90`) | **les 6 justes** | juste | juste | aucune |
| compacte (`OD : −2.25 (−0.75) 90°`) | **les 6 justes** | non lue | juste | aucune |
| **tableau bordé** | **aucune lue** | juste | juste | aucune |

**Le résultat qui compte : zéro valeur fausse sur les trois.** Tout est soit juste, soit refusé
avec son motif.

Le tableau bordé est le point faible, et il est franc : les traits du tableau désorientent l'OCR,
qui rend de la bouillie (`[on | 25 | 45 | w |`). Le module refuse en bloc — ce qui est le bon
comportement — mais cela veut dire qu'une ordonnance présentée en tableau ne fera rien gagner.

Ces deux essais ont chacun révélé un défaut réel que le banc écrit à la main n'avait pas vu :
le mot `Cyl` rendu `Cy1l` et collé à sa valeur, dont le `l` devenait le chiffre 1 — une valeur
fausse rendue sans alerte. Les deux cas sont maintenant dans `outils/ordonnance-lecture-banc.js`.

## Les limites, dites franchement

- **L'écriture manuscrite ne passera pas.** Les OCR courants lisent mal une ordonnance écrite à la
  main, et une ordonnance médicale manuscrite est le pire cas qui soit. Si la plupart des
  ordonnances de vos clients sont manuscrites, ce module ne servira presque jamais.
- **Je n'ai pas testé sur de vraies photos.** Mes essais portent sur des ordonnances **rendues à
  l'écran**, propres et droites. Une photo prise à la borne ajoute l'inclinaison, l'ombre, le grain.
  Il faut refaire la mesure sur dix vraies ordonnances avant de décider quoi que ce soit.
- **Le tableau bordé ne donne rien**, et c'est une mise en page courante.

## Ce qu'il reste à décider

**Où l'OCR tourne.** Deux possibilités :

1. **Sur le serveur, à l'arrivée du dossier** — ma recommandation. La borne reste légère et rapide,
   le moteur se met à jour en un seul endroit, et le client n'attend jamais. Les valeurs sont prêtes
   quand l'opticien ouvre le dossier.
2. **Sur la borne** — fonctionne hors ligne, mais ajoute 6 à 15 Mo de données de langue et quelques
   secondes de calcul par ordonnance sur une machine qui fait déjà tourner le suivi du visage.

**Ce qu'il faut ensuite** : afficher la proposition à côté de la photo sur le tableau de bord, avec
un bouton pour valider ou corriger chaque valeur. Une à deux journées, une fois la décision prise.

**Avant tout cela** : envoyez-moi dix photos de vraies ordonnances de vos clients, telles qu'elles
arrivent. C'est le seul moyen de savoir si ce module vous fera gagner du temps ou s'il restera au
tiroir — et cela prend dix minutes à réunir.
