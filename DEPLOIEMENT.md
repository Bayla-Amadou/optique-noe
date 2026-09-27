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

Le logiciel ouvre un petit tableau de bord sur le réseau local, pour
consulter les commandes depuis un téléphone ou l'ordinateur de la boutique.

**Il est protégé par un mot de passe écrit en clair dans le code :
`noa2025`.** Ce n'est pas acceptable sur un réseau de boutique. Avant
l'ouverture, définissez une variable d'environnement système :

```powershell
[Environment]::SetEnvironmentVariable('NOA_DASHBOARD_PASSWORD','<votre mot de passe>','Machine')
```

Puis redémarrez la borne.

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
