# Installer N.O.A sur la borne

Borne HN-27SK-F : Windows, Intel Core i7, 16 Go, Intel Iris Xe,
écran tactile 27 pouces 1920 × 1080 **monté à la verticale**, caméra 13 MP
orientable, imprimante thermique, lecteur RFID.

---

## Le point à comprendre avant de commencer

**Fabriquez l'installateur SUR la borne, pas sur le Mac.**

Le projet embarque `better-sqlite3`, qui n'est pas du JavaScript : c'est une
bibliothèque compilée, et il en faut une version différente pour chaque
système. Compiler du Windows depuis un Mac demande une chaîne croisée qui
échoue de dix façons différentes, et l'erreur n'apparaît qu'au lancement sur
la borne — le pire moment pour la découvrir.

La borne est un PC Windows complet. Elle sait très bien fabriquer son propre
installateur, et ce qu'elle fabrique fonctionne forcément chez elle.

---

## 1. Préparer la borne — une seule fois

Installez, dans cet ordre :

1. **Node.js 20 LTS** — https://nodejs.org (l'installateur `.msi` x64).
   Cochez *Automatically install the necessary tools* : c'est ce qui
   apporte le compilateur dont `better-sqlite3` a besoin.
2. **Git pour Windows** — https://git-scm.com/download/win

Vérifiez dans PowerShell :

```powershell
node --version    # doit afficher v20.x
git --version
```

---

## 2. Récupérer le projet et fabriquer l'installateur

```powershell
cd C:\
git clone https://github.com/Bayla-Amadou/optique-noe.git
cd optique-noe
git checkout claude/trusting-pascal-TXK2N
npm install
npm run build
```

Comptez dix à quinze minutes la première fois. Le résultat arrive dans
`C:\optique-noe\dist\` :

- `NOA-Optique-1.0.0-x64.exe` — l'installateur classique ;
- `NOA-Optique-1.0.0-x64-portable.exe` — la version sans installation, qui
  tourne depuis une clé USB. Pratique pour une démonstration.

Installez avec le premier.

---

## 3. Tourner l'écran

Windows doit savoir que la dalle est à la verticale, sinon l'image reste
couchée sur un écran debout.

**Paramètres → Système → Affichage → Orientation → Portrait**

Vérifiez ensuite que la résolution affiche bien **1080 × 1920**. Si elle
reste en 1920 × 1080, l'orientation n'a pas été appliquée.

Le logiciel détecte le format au démarrage et se met en page tout seul. Il
n'y a rien à régler de son côté.

---

## 4. Orienter la caméra

La caméra de la borne est orientable. Réglez-la de sorte qu'une personne
**debout** apparaisse tête et épaules dans l'image, pas le plafond.

Pour vérifier, lancez le logiciel en mode diagnostic :

```powershell
"C:\Program Files\NOA Optique\NOA Optique.exe" --diag
```

Un badge apparaît en haut de l'image. Trois chiffres comptent :

| | |
|---|---|
| `…ms` | temps de traitement d'une image. **Doit rester sous 33.** |
| `e…` | nombre de fois où la monture s'est effacée. Devrait rester à 0. |
| `perte …` | images où le visage a été perdu sur les dix dernières secondes. |

Si le temps dépasse 33 ms de façon durable, dites-le-moi : il y a de la
marge à récupérer, et je préfère le savoir avant l'ouverture.

---

## 5. Démarrage automatique

La borne doit se lancer seule après une coupure de courant — ce qui arrive.

Appuyez sur **Windows + R**, tapez `shell:startup`, validez. Déposez dans le
dossier qui s'ouvre un raccourci vers :

```
C:\Program Files\NOA Optique\NOA Optique.exe
```

Puis, dans les **Options d'alimentation**, réglez la mise en veille de
l'écran et du disque sur **Jamais**.

---

## 6. Verrouiller la borne

Un client ne doit pas pouvoir sortir du logiciel. Windows propose un mode
prévu pour ça :

**Paramètres → Comptes → Autres utilisateurs → Configurer un kiosque**

Créez un compte dédié, choisissez l'application NOA Optique, et faites
ouvrir la session Windows automatiquement sur ce compte.

---

## 7. Le paiement

`paiement.config.json` **n'est volontairement pas dans l'installateur**, et
c'est une décision de sécurité : ce fichier contient la clé partagée avec le
serveur de paiement, et un installateur se copie, se prête, se retrouve sur
une clé USB.

Il se dépose à la main sur la borne, après l'installation :

```
C:\Program Files\NOA Optique\resources\paiement.config.json
```

Contenu, sur le modèle de `paiement.config.exemple.json` :

```json
{
  "url":      "https://paiement.noa.sn",
  "cle":      "la clé partagée avec le serveur",
  "boutique": "dakar-plateau"
}
```

Sans ce fichier, la borne affiche « paiement non configuré » et l'on
encaisse au comptoir. Elle ne confirmera jamais une commande d'elle-même :
seule une notification vérifiée du serveur peut le faire.

---

## 8. Le tableau de bord

Le logiciel peut ouvrir un petit tableau de bord pour consulter les
commandes. **Il est éteint par défaut**, et il n'existe plus de mot de passe
écrit dans le code.

Pour l'activer, définir une variable d'environnement système (10 caractères
au moins) puis redémarrer la borne :

```powershell
[Environment]::SetEnvironmentVariable('NOA_DASHBOARD_PASSWORD','<votre mot de passe>','Machine')
```

- Il n'écoute que la borne elle-même (`http://127.0.0.1:3000`). Pour
  l'ouvrir au réseau de la boutique, c'est un choix explicite :
  `NOA_DASHBOARD_HOTE=0.0.0.0`. Ne le faites que sur un réseau de
  confiance.
- Cinq mots de passe faux en cinq minutes bloquent l'adresse concernée
  pendant le reste de la fenêtre. Les sessions expirent après 8 heures.

---

## Mettre à jour plus tard

```powershell
cd C:\optique-noe
git pull origin claude/trusting-pascal-TXK2N
npm install
npm run build
```

Puis relancez l'installateur produit dans `dist\`. Il remplace la version
précédente en conservant la base de données et le fichier de paiement.

---

## 9. Le serveur de dossiers

Les dossiers clients vivent sur le serveur, pas sur la borne. La borne les
écrit d'abord localement, puis les transmet ; si le réseau est coupé, elle
accumule et enverra plus tard. Une commande ne peut pas se perdre parce que
le Wi-Fi a hoqueté pendant qu'un client payait.

Comme pour le paiement, la clé partagée n'est pas dans l'installateur. Le
fichier se dépose à la main après installation :

```
C:\Program Files\NOA Optique\resources\serveur.config.json
```

```json
{
  "url":      "https://noa.example.sn",
  "cle":      "la clé partagée avec le serveur",
  "boutique": "dakar-plateau"
}
```

Inutile de redémarrer : la borne relit le fichier toutes les trente
secondes tant qu'il manque, puis n'y touche plus.

### Ce que la borne envoie

`POST /dossiers`, en-tête `X-NOA-Cle`, corps JSON :

| champ | contenu |
|---|---|
| `id` | numéro de commande, unique |
| `nom`, `tel` | le client |
| `monture`, `extras` | ce qu'il a choisi |
| `paiement`, `montant` | mode et somme en FCFA |
| `pd_mm`, `faceWidth_cm`, `faceShape` | les mesures |
| `date` | ISO 8601 |
| `boutique` | ajouté par la borne |
| `photos.ordonnance` | l'ordonnance scannée, en base64 |
| `photos.essai` | le portrait avec la monture, en base64 |

Le serveur répond **2xx** s'il a bien enregistré. Toute autre réponse fait
réessayer la borne — sauf une **4xx**, qu'elle interprète comme un refus
définitif : le dossier est marqué et mis de côté, sans bloquer les suivants.

Le même identifiant peut arriver deux fois, si une réponse s'est perdue en
route. Le serveur doit donc traiter `id` comme une clé : réenregistrer, pas
dupliquer.

### Ce qui est effacé de la borne

Dès qu'un dossier est accepté, **les deux photos sont supprimées de la
borne**. La ligne reste, sans images, pour le tableau de bord local.

Ce n'est pas de l'économie de disque. Une borne est une machine posée en
boutique, physiquement accessible, qui peut être volée ou revendue. Y
laisser s'accumuler des années d'ordonnances et de portraits serait une
réserve de données de santé sans surveillance. Ce qui n'est plus sur la
borne ne peut pas fuir depuis la borne.

### Avant l'ouverture — obligations légales

Ce qui transite ici, ce sont des **données de santé** et des **photos de
personnes identifiables**. Au Sénégal, leur traitement relève de la loi
n° 2008-12 et de la Commission de protection des données personnelles.

Trois points à régler avec un juriste, pas avec moi :

1. **Le consentement du client**, recueilli sur la borne avant la collecte,
   et conservé. Il n'existe pas aujourd'hui dans le parcours — c'est un
   écran à ajouter, et je ne l'ai pas écrit parce que son texte engage
   l'entreprise.
2. **La déclaration du traitement** auprès de la CDP.
3. **Une durée de conservation** décidée et appliquée côté serveur. Garder
   indéfiniment n'est pas une option neutre.

Le chiffrement au repos sur le serveur et des sauvegardes elles-mêmes
chiffrées relèvent du même sujet.


---

## 10. Distribuer l'application par un lien

L'application s'installe aussi bien sur la borne que sur l'ordinateur d'un
opticien, d'un commercial ou d'un partenaire. Windows et macOS.

### Fabriquer une version

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub fabrique les deux installateurs et publie une **Release**. Le lien
de téléchargement est celui de cette page :

```
https://github.com/Bayla-Amadou/optique-noe/releases/latest
```

C'est le lien à envoyer. Windows télécharge le `.exe`, macOS le `.dmg`.

**Pourquoi passer par GitHub plutôt que par votre Mac.** Un `.dmg` ne se
fabrique que sur un Mac, un `.exe` que sur Windows. Mais surtout :
`better-sqlite3` est une bibliothèque compilée, qui doit être construite sur
le système auquel elle est destinée. Les chaînes de compilation croisée
échouent de dix façons, dont aucune ne se voit avant le lancement sur la
machine du client. Ici, chaque système construit le sien.

Le même mécanisme lance les contrôles de syntaxe et le banc du serveur avant
de construire : une version qui ne passe pas les tests ne sort pas.

### Deux fenêtres, deux usages

Sur un ordinateur ordinaire, l'application s'ouvre dans une **fenêtre
normale**, avec sa barre de titre, qu'on déplace et qu'on ferme.

Sur la borne, il faut le plein écran sans bordure. C'est le raccourci de
démarrage automatique qui le demande (section 5) :

```
"C:\Program Files\NOA Optique\NOA Optique.exe" --kiosque
```

Ce n'est pas un détail d'affichage. Une application qui s'ouvre en plein
écran sans bordure et sans moyen visible d'en sortir passe pour un logiciel
malveillant, et l'utilisateur d'un Mac ne devinera pas Cmd+Q.

### La signature — à régler avant de diffuser largement

Sans certificat, les deux systèmes préviennent l'utilisateur, et le message
fait peur :

| | ce que voit l'utilisateur | comment passer |
|---|---|---|
| Windows | « Windows a protégé votre ordinateur », éditeur inconnu | Informations complémentaires → Exécuter quand même |
| macOS | « impossible de vérifier le développeur » | clic droit sur l'application → Ouvrir |

Pour une poignée de postes internes, c'est acceptable : on explique une
fois. Pour une diffusion large, non — la moitié des gens abandonnent devant
ce message, et il est impossible de leur reprocher.

Ce qu'il faut, et ce que ça coûte :

- **macOS** : compte Apple Developer, **99 $ par an**. L'application est
  alors signée et *notarisée* — Apple la vérifie, et plus aucun avertissement
  n'apparaît. C'est aujourd'hui quasi obligatoire : chaque version de macOS
  rend le contournement plus difficile.
- **Windows** : certificat de signature de code, **de l'ordre de 200 à 400 $
  par an**. Un certificat OV met quelques semaines à bâtir sa réputation
  auprès de SmartScreen ; un certificat EV l'obtient immédiatement, et coûte
  plus cher.

Les deux se branchent dans le même mécanisme, par des secrets GitHub. Rien à
changer dans le code, uniquement de l'administratif.

### Ce que l'application fait sur un poste ordinaire

L'essayage virtuel fonctionne : c'est la caméra de l'ordinateur.

Le paiement affiche « non configuré » et les dossiers s'accumulent en file
d'attente, tant que `paiement.config.json` et `serveur.config.json` ne sont
pas déposés. C'est voulu : ces fichiers portent les clés de la boutique, et
ils n'ont rien à faire sur l'ordinateur portable d'un commercial.

Autrement dit, la même application sert de **démonstration** sans aucun
risque de déclencher une vraie commande.


---

## 11. La clé USB — et pourquoi elle évite vraiment de payer

C'est exact, et ce n'est pas une astuce : **les avertissements viennent du
téléchargement, pas du fichier.**

Windows attache aux fichiers venus d'Internet une marque invisible, le *Mark
of the Web*. C'est elle, et non l'absence de signature, qui déclenche
« Windows a protégé votre ordinateur ». Un fichier copié depuis une clé USB
ne la porte pas : **aucun avertissement n'apparaît.**

macOS fonctionne pareil, avec l'attribut de quarantaine. Copié depuis une
clé, un `.app` s'ouvre normalement.

### Ce qu'il faut prendre

| | fichier | il fait quoi |
|---|---|---|
| Windows | `NOA-Optique-…-portable.exe` | s'exécute sans installation, depuis la clé |
| Windows | `NOA-Optique-….exe` | installe normalement |
| macOS | `NOA-Optique-….zip` | contient l'application, à glisser dans Applications |

Les trois sont produits à chaque version, dans la même Release.

### Ce que la clé USB ne remplace pas

**Les mises à jour.** Chaque nouvelle version demande de repasser
physiquement sur chaque machine. Avec une borne et deux portables, c'est
une affaire de dix minutes. Avec dix boutiques, c'est une tournée.

**La confiance.** N'importe qui peut tendre une clé avec une version
modifiée. Pour des machines internes que vous installez vous-même, la
question ne se pose pas. Pour un partenaire qui reçoit un fichier, elle se
pose.

**Le lien.** Une clé USB est l'exact contraire d'un lien à envoyer. Si
l'objectif est qu'un médecin partenaire installe l'application depuis un
message, il téléchargera — et l'avertissement reviendra.

**L'antivirus.** Un exécutable non signé peut être mis en quarantaine par
un antivirus d'entreprise, quelle que soit sa provenance. C'est plus rare
que l'avertissement système, mais ça arrive.

### Donc

- **La borne, vos postes, quelques opticiens** : clé USB, zéro franc. C'est
  la bonne réponse, et il n'y a rien à justifier.
- **Envoyer un lien à des partenaires, des médecins, des clients** : la
  signature se paie. La moitié des gens abandonnent devant l'avertissement.

Les deux peuvent coexister : on distribue par clé aujourd'hui, on signe le
jour où l'on diffuse largement. Rien à changer dans le code, uniquement des
secrets à ajouter.

### Un détail si vous voulez une clé vraiment autonome

En version portable, l'application s'exécute depuis la clé, mais elle écrit
ses données (base de commandes, photos) dans le profil de l'ordinateur hôte,
pas sur la clé. Pour une démonstration, c'est sans conséquence — et c'est
même préférable : rien ne reste sur la clé qu'on prête.

Si vous vouliez une clé qui emporte aussi ses données, dites-le : c'est une
option à ajouter au lancement, pas une refonte.


---

## 12. Une flotte de bornes, allumées en permanence

Les bornes vous appartiennent, elles ne servent qu'à ça, et elles tournent
jour et nuit. Trois conséquences.

### Ce qui fait qu'une machine est une borne

Un fichier, **`borne.json`**, posé à côté de l'exécutable — donc sur la clé
USB en version portable :

```json
{
  "borne": "dakar-plateau-1",
  "redemarrage": "04:00"
}
```

Sa seule présence suffit : plein écran, aucune sortie possible, veille
interdite, redémarrage nocturne. Sur un ordinateur ordinaire, ne le mettez
pas, et l'application s'ouvre en fenêtre normale.

**Pourquoi un fichier et pas un argument de lancement.** Une borne tourne
des mois sans qu'on la touche. Le jour où quelqu'un la relance depuis le
menu Démarrer, depuis l'explorateur, ou après une mise à jour de Windows,
l'argument est perdu — et la borne s'ouvre en fenêtre au milieu d'une
boutique, avec une croix pour la fermer. Le fichier, lui, est toujours là.

Donnez à chaque borne un nom différent : il voyage avec chaque dossier. Avec
plusieurs bornes en service, savoir laquelle a produit une commande est la
première chose qu'on cherche quand quelque chose cloche.

### Ce que la borne fait toute seule

**L'écran ne s'éteint jamais.** Windows finit toujours par réappliquer une
politique de veille après une mise à jour, et on retrouve la borne noire un
matin. L'application le bloque elle-même, sans dépendre des réglages du
système.

**Un plantage se rattrape.** Si la page meurt ou se bloque, l'application
redémarre seule. Personne ne surveille une borne à deux heures du matin.

**Elle repart chaque nuit**, à quatre heures par défaut. Aucun logiciel qui
tourne des semaines sans interruption ne garde une mémoire stable — ni le
nôtre, ni Chromium, ni les pilotes de caméra. Plutôt que d'attendre le jour
où ça lâchera devant un client, on choisit le moment.

**L'écran d'accueil dérive lentement.** Vingt pixels en sept minutes, aller
et retour. Un logo bleu soutenu affiché des heures au même endroit finit par
s'imprimer dans la dalle, et la marque reste ensuite en fantôme sur tout ce
qui s'affiche. Personne ne remarquera la dérive ; la dalle, si.

### Mettre à jour une flotte par clé USB

Sur chaque borne, dans cet ordre :

1. copier le nouveau `NOA-Optique-…-portable.exe` sur la clé ;
2. sur la borne, remplacer l'ancien fichier ;
3. vérifier que `borne.json`, `paiement.config.json` et
   `serveur.config.json` sont **toujours là** — ce sont eux qui font la
   borne, pas l'exécutable ;
4. relancer.

Le point 3 est celui qu'on oublie. Une borne qui a perdu son `borne.json`
s'ouvre en fenêtre ; une borne qui a perdu `serveur.config.json` accumule
les dossiers sans les transmettre — sans rien dire, puisque c'est
exactement le comportement prévu quand le serveur n'est pas encore
configuré.

Avant de repartir, ouvrez le tableau de bord de la borne et vérifiez que la
file de dossiers est bien à zéro.

### Ce qui reste à surveiller

L'usure de la dalle et celle du disque. Un SSD de 256 Go écrit en continu
pendant des années finit par fatiguer — la base et les photos sont petites,
mais les journaux de Windows, non. Un coup d'œil par trimestre suffit.

## 13. Ce que la borne fait seule, et ce qu'elle ne peut pas faire

**Fait par l'application (vérifié sous Electron, sans écran) :**

- La page est servie sous `noa://app/`, pas en `file://`. La protection du
  navigateur (`webSecurity`) est donc **active**, et les fichiers secrets
  (`paiement.config.json`, `serveur.config.json`, `borne.json`, dossier
  `serveur/`) sont refusés à la page (403).
- Navigation verrouillée : ni lien, ni nouvelle fenêtre, ni site externe.
- Mode borne : vrai plein écran, pas de menu, pas d'outils de
  développement, pas de menu contextuel, pas de zoom, raccourcis bloqués
  (F-touches, Échap, Ctrl+R/W/Q…), fermeture de fenêtre refusée.
- **Sortie du personnel : `Ctrl + Alt + Maj + Q`.**
- Démarrage automatique à l'ouverture de session Windows. Pour le
  désactiver : `"demarrageAuto": false` dans `borne.json`. **L'application
  doit alors être copiée sur le disque de la borne**, pas lancée depuis la
  clé USB : le démarrage automatique pointe vers l'endroit où elle se trouve.
- Reprise après plantage de la page : on recharge la page ; si elle retombe
  trois fois en dix minutes, on relance toute l'application. Une page qui ne
  donne plus signe de vie pendant 60 s est rechargée.
- Caméra débranchée ou figée : reconnexion automatique (0,5 s, 1 s, 2 s,
  4 s, 8 s, puis toutes les 15 s sans fin). Après cinq échecs, la borne
  demande au client de prévenir un conseiller, et continue d'essayer.
- Contexte WebGL perdu : le rendu se met en pause et se reconstruit seul ; si
  rien ne revient en 8 s, la page se recharge.

**Que l'application ne peut PAS faire, et qui se règle dans Windows :**

- La touche Windows, Ctrl+Alt+Suppr et Alt+Tab sont gérés par Windows, pas
  par nous. Pour une vraie borne, utiliser le **mode kiosque de Windows**
  (« Accès attribué », Windows 10/11 Pro) avec un compte dédié qui ne lance
  que NOA. C'est la seule protection fiable contre un client qui force le
  clavier.
- Une borne dont la prise est débranchée ne redémarre que si le BIOS est
  réglé sur « reprise après coupure de courant : allumer ».

## 14. Ajouter une monture, et tester l'endurance

### Valider un modèle avant de l'ajouter

```bash
node outils/valider-monture.js 3dmodel/<monture>/model.glb --marquage 49-20-140
```

Le marquage est le chiffre gravé sur la monture réelle (largeur de verre, pont,
branche, en mm). L'outil lit le fichier sans l'afficher et signale : unité,
taille hors de la plage usuelle, modèle décentré (l'origine doit être au milieu
du pont), verres non nommés, extensions obsolètes, et surtout l'écart entre le
modèle et la monture réelle. Une face 25 % trop grande par rapport aux branches
se voit ici, pas sur un visage. Code de sortie 1 en cas d'erreur.

### Test d'endurance sur un serveur

Il enchaîne des sessions client, avec changements de monture, et mesure la
mémoire graphique à chaque tour. Une application saine se stabilise ; une fuite
fait monter la courbe sans jamais redescendre.

Sur un serveur Linux **séparé de celui des dossiers clients** :

```bash
npm install
npx playwright-core --version        # navigateur déjà présent, sinon : voir README Playwright
FILM_Y4M=film.y4m SESSIONS=2000 CHANGEMENTS=8 SORTIE=endurance.csv \
  nohup node outils/endurance.js > endurance.log 2>&1 &
```

`film.y4m` est une courte vidéo d'un visage (format Y4M) qui sert de fausse
caméra. `SORTIE` écrit un fichier CSV à renvoyer pour analyse. Le verdict
compare la seconde moitié des sessions à la première.

**Limite :** sans carte graphique le rendu est logiciel. Ce test trouve les
fuites de l'application, pas celles d'un pilote graphique ni de la caméra USB :
une nuit sur la vraie borne reste nécessaire.

## 15. Mode collecte : apprendre des vrais clients

Pendant la phase de test, la borne peut enregistrer des **mesures anonymes** à
chaque essayage, pour savoir où l'essayage tient et où il casse sur de vraies
têtes. Cela fonctionne **hors ligne** : tout est écrit en local.

### Activer

Dans `borne.json` : `"collecte": true` (ou lancer avec `--collecte`). Sans cela,
rien n'est enregistré. Un avis s'affiche alors sur l'écran d'accueil, avec un
bouton « Ne pas participer » : le client qui l'actionne n'est pas enregistré,
et le choix ne vaut que pour son essayage.

### Ce qui est enregistré (et rien d'autre)

Largeur de tête mesurée, écart des pupilles, largeur de visage, forme du visage
(une valeur parmi cinq), angles maximaux, distance mini à la caméra, part du
temps où le suivi tenait, nombre de disparitions de la monture, temps par image,
niveau de qualité, gain de lumière, identifiant de la monture essayée, issue
(monture choisie, arrêt), heure du jour et jour. Un identifiant aléatoire sans
lien avec une personne.

**Jamais** : photo, image, nom, téléphone, numéro de dossier, ordonnance, genre,
couleur de peau. Le processus principal (`mesures.js`) ne garde que les champs
prévus, bornés ; un champ inconnu ou un texte libre est jeté. Un essayage de
moins de 8 secondes n'est pas enregistré.

### Où sont les données, et les lire

Fichier `mesures.ndjson` dans le dossier de données de l'application (sur
Windows : `%APPDATA%\optique-noe\`). Copier-le par clé USB, puis :

```bash
node outils/analyse-mesures.js mesures.ndjson
```

L'outil donne la distribution (P5, médiane, P95), la part d'essayages dégradés,
les heures à problème, et des **propositions** de réglage. Il ne modifie rien :
une borne qui se règle seule en boutique serait imprévisible. On collecte, on
regarde, on décide, on met à jour. Le fichier est limité à 20 Mo (l'ancien est
remplacé), donc il ne grossit pas sans fin.

### Texte de l'avis affiché à la borne

> Pour améliorer l'essayage, cette borne note des mesures **anonymes** (taille de
> tête, stabilité). Aucune photo, aucun nom. [Ne pas participer]

**À faire valider par un juriste avant tout usage public** (avis à l'entrée de la
boutique en plus de la borne, déclaration à la CDP si elle l'exige). Les mesures
sont très peu identifiantes, mais ce sont des données issues du corps d'une
personne : le test de seuil n'est pas à ta charge de juger seule.

## 16. Gérer une flotte de bornes comme une chaîne de restauration rapide

Les bornes de commande des grandes chaînes tiennent jour et nuit grâce à quatre
choses : un système verrouillé sur une seule application, un surveillant qui
relance ce qui plante, un redémarrage de nuit, et une supervision à distance.
Voici où nous en sommes sur chacune, sans arrondir.

| Capacité | Fait ? | Comment, ou ce qu'il reste |
|---|---|---|
| **Verrouillage sur une application** | en partie | L'application bloque ses propres sorties (phase 0). Le verrouillage de **Windows** (touche Windows, Alt+Tab) se règle dans Windows : voir plus bas. |
| **Surveillant interne** | oui | Page rechargée si elle plante ; programme relancé si elle retombe 3 fois en 10 min. |
| **Surveillant externe** | script écrit, **non essayé** | `outils/windows/installer-borne.ps1` : tâche planifiée qui relance le programme s'il a disparu. À essayer sur une borne de test. |
| **Redémarrage de nuit** | oui, deux niveaux | L'application repart à 04:00 (`borne.json`) ; le script ajoute le redémarrage de Windows à 04:10. |
| **Supervision** | oui, testé | Signe de vie chaque minute, tableau de bord (`tableau-de-bord/`), alertes : caméra perdue ou absente, envois en attente, mémoire, version en retard, borne muette. |
| **Ordres à distance** | oui, testé | Quatre ordres, liste fermée : redémarrer, recharger la page, activer ou couper la collecte. Exécution à la minute. |
| **Surveillance des périphériques** | caméra seulement | La caméra est vue (branchée, en service, perdue, absente). Le scanner d'ordonnance n'est pas encore surveillé. |
| **Mises à jour à distance** | **non** | Voir ci-dessous : c'est une décision à prendre. |
| **Bureau à distance** | hors code | Un outil à installer sur chaque borne : RustDesk (libre, serveur auto-hébergé sur Hetzner) ou AnyDesk. |
| **Alertes poussées** (SMS, WhatsApp, courriel) | non | Aujourd'hui l'alerte n'existe que si quelqu'un regarde le tableau de bord. À ajouter côté serveur. |

### Mises à jour à distance : le choix qui reste

Une borne ne peut se mettre à jour seule que si elle est **installée**, pas
lancée depuis une clé USB. Deux voies :

1. **Installateur Windows (NSIS) + mise à jour automatique** depuis les
   « Releases » GitHub : la borne vérifie et se met à jour au redémarrage de
   nuit. C'est la voie des grandes flottes. Elle exige de renoncer à la version
   portable pour les bornes, et un installateur non signé affichera un
   avertissement de Windows à la première installation seulement.
2. **Rester sur la clé USB**, avec la procédure du paragraphe 12, et mettre à
   jour borne par borne. Raisonnable jusqu'à quatre ou cinq bornes ; au-delà,
   on oublie une borne.

Je recommande la voie 1 dès que tu as plus de trois bornes. Elle n'est pas
écrite : dis-moi ton choix.

### Verrouiller Windows (Accès attribué)

À faire dans Windows 10/11 Pro ou Entreprise, sur un compte local dédié
(`noa`), pas sur ton compte administrateur :

1. Paramètres → Comptes → **Autres utilisateurs** → *Configurer un kiosque* →
   Accès attribué → compte `noa` → application « NOA Optique ».
2. **Ouverture de session automatique** pour ce compte (`netplwiz`, ou l'outil
   Sysinternals *Autologon*) : la borne revient seule après une coupure.
3. BIOS : *Restore on AC Power Loss* → **Power On**.
4. Windows Update : plages d'activité de 8 h à 22 h ; redémarrage de nuit géré
   par le script, pas par Windows au milieu d'un client.

### Ce que la supervision voit

Seulement des données techniques : nom de la borne, version, état de la caméra,
mémoire, file d'envoi, durée de fonctionnement. Aucune donnée de client.

### Mettre le tableau de bord en ligne

La page est dans `tableau-de-bord/`. Le dépôt publie déjà sa racine sur GitHub
Pages ; **dès que cette branche est fusionnée dans `main`**, la page est
disponible à
`https://bayla-amadou.github.io/optique-noe/tableau-de-bord/`. Vérifier dans
GitHub : *Settings → Pages → Source : Deploy from a branch → main / (root)*.

Ensuite, sur le serveur Hetzner : `NOA_ORIGINES=https://bayla-amadou.github.io`
(et un serveur en **HTTPS**), puis, sur chaque borne, `serveur.config.json` avec
l'adresse et la clé. Le dépôt étant public, tout le monde peut voir
l'**interface** ; les **données** ne sortent du serveur qu'après le mot de passe
de l'atelier, et seulement vers l'origine listée.

## 17. Mises à jour automatiques des bornes

### Ce qu'elles font

Une borne **installée** (installateur Windows, pas la version portable sur clé
USB) vérifie les « Releases » GitHub 90 secondes après son démarrage puis toutes
les 6 heures, télécharge la nouvelle version en arrière-plan, et l'**installe la
nuit**, dans la demi-heure qui suit son redémarrage nocturne (04:00 par défaut,
réglable par `"redemarrage"` dans `borne.json`).

Trois garde-fous, vérifiés par `node outils/maj-banc.js` :

1. **Jamais pendant une séance** : si quelqu'un essaie des lunettes à 04:10,
   l'installation attend la fin de la fenêtre, puis la nuit suivante.
2. **Seulement dans la fenêtre de nuit** : pas de redémarrage surprise en pleine
   journée, même si la version est prête depuis 6 h du matin.
3. **Vous gardez la main** : `electron-builder` crée chaque version en
   **brouillon**. Les bornes ne la voient pas tant que vous n'avez pas publié la
   Release à la main sur GitHub. C'est le moment d'essayer l'installateur sur une
   borne de test.

Pour exclure une borne : `"miseAJour": false` dans son `borne.json`.

### Publier une version

```bash
npm version patch                        # 1.0.0 -> 1.0.1 (met à jour package.json)
git push origin main --follow-tags       # le tag v1.0.1 déclenche la construction
```

GitHub construit les installateurs Windows et macOS et crée une Release en
**brouillon** avec `NOA-Optique-1.0.1-x64.exe` et `latest.yml` (le fichier que
les bornes lisent, avec l'empreinte de l'installateur : une borne refuse un
fichier altéré). Puis :

1. Télécharger l'installateur du brouillon, l'installer sur **une borne de test**.
2. Si tout va bien : GitHub → Releases → le brouillon → **Publish release**.
3. Les bornes la téléchargent dans les 6 heures et l'installent la nuit suivante.
4. Le tableau de bord montre « Mise à jour 1.0.1 prête » puis la nouvelle version.

Le numéro de version doit **augmenter** : une borne n'installe jamais une version
plus ancienne ou égale.

### Ce qui n'est pas vérifié

La **décision** (quand installer, quand surtout ne pas le faire) est testée.
Le **téléchargement et l'installation réels** ne l'ont pas été : il faut une
vraie Release et un Windows. La première mise à jour doit se faire sous
surveillance, sur une borne de test, avant toute la flotte. Si une version est
mauvaise, publiez une nouvelle version corrigée : il n'y a pas de retour arrière
automatique.

Un installateur non signé affiche un avertissement de Windows à la **première
installation** seulement ; les mises à jour suivantes, lancées par la borne
elle-même, ne le montrent pas.
