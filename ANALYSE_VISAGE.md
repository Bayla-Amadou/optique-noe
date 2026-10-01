# Analyse de l'essayage Visage, et plan pour NOA

Livrable 1 : analyse et plan, **aucun code modifié**. Source : lecture de
`VirtualEyewearTryOn/eyewear.html` et `lib/visageAR.js` (le fichier de 507
lignes qui fait tout l'essayage), des fichiers `.cfg` du suivi, et de la
documentation. Rien n'est copié : on décrit des mécanismes pour les refaire
à notre façon. Le suivi lui-même (`visageSDK.wasm`) est une boîte noire,
on ne peut en lire que les réglages et la documentation.

## A. Ce que fait vraiment l'exemple Visage

Le fichier `visageAR.js` fait trois choses, dans cet ordre, à chaque image.

1. **Lire l'image et suivre le visage.** L'image de la caméra est recopiée
   dans un canvas 2D, lue pixel par pixel (`getImageData`), puis donnée au
   suivi. Tout se passe sur le fil principal, sans worker. En retour : une
   translation (x, y, z) en mètres et une rotation (3 angles).
2. **Appliquer la même pose à la monture et à un masque de tête.** Les deux
   objets reçoivent exactement la même translation et la même rotation
   (ordre d'Euler YXZ, avec π ajouté au lacet pour retourner le modèle).
3. **Dessiner en trois passes** : (a) le flux vidéo sur un plan, avec une
   caméra orthographique ; (b) le masque de tête, **invisible mais écrivant
   la profondeur** ; (c) la monture, avec une caméra en perspective. Entre
   (a) et (b) on efface la profondeur seulement, pas la couleur.

Le masque est ce qui cache les branches derrière la tête. C'est le même
principe que nos occluders (`colorWrite:false, depthWrite:true`).

| Mécanisme | Ce que Visage fait | Pourquoi |
|---|---|---|
| Trois scènes, trois caméras | fond (ortho), masque, monture (perspective) | l'ordre de dessin remplace tout calcul d'occlusion |
| Cadrage `setupViewingFrustrum` | calcule la zone visible selon que l'image est plus large ou plus haute que l'écran (« fillX / fillY »), pour que vidéo et 3D se recouvrent après recadrage | une vidéo 16:9 sur un écran 9:16 est rognée ; la 3D doit l'être pareil |
| Champ de vision | **fixe : `tan(fov/2) = 1/3`, soit 36,9° vertical**, quelle que soit la caméra | simplification : aucune calibration |
| Distance du visage | déduite de l'écart entre pupilles, **supposé 65 mm** par défaut ; un champ de saisie permet de le corriger à la main (`setIPD`) | pas d'autre moyen avec une caméra ordinaire |
| Lissage | **dans le suivi**, par zones du visage (`smoothing_factors`), réglé « prudemment pour éviter le retard » | |
| Perte du visage | monture et masque sont **téléportés en (0, 0, −5)**, derrière la caméra. Pas de maintien, pas de fondu | rien d'autre |
| Changement de monture | on retire l'ancienne et on charge la nouvelle (OBJ), suivi inchangé | |
| Changement d'orientation | si la taille de la vidéo change, **tout est détruit et refait**, nouveau moteur de rendu compris | |
| Reprise après perte | `recovery_timeout 800` : le suivi tente de retrouver le visage pendant 0,8 s avant de tout réinitialiser | évite de repartir de zéro sur une perte brève |
| Oreilles | option du suivi (`refine_ears`, jeu « With Ears »), désactivée dans la configuration de base | précision des points d'oreille |

### Ce qui n'est PAS à imiter chez Visage

- La perte du visage (téléportation) : la nôtre est déjà meilleure.
- Le champ de vision fixe : il rend l'échelle fausse sur toute caméra qui
  n'a pas ce champ.
- La reconstruction complète au changement d'orientation : le moteur de
  rendu n'est pas libéré (`clear_` ne fait pas de `dispose`, et libère
  `this.v_ppixels` alors que la variable est locale : fuite à chaque
  rotation de caméra). Sur une borne 24/7, c'est exactement ce qu'il ne
  faut pas faire.
- La lecture pixel par pixel sur le fil principal.
- Un seul masque générique, de taille unique, pour tous les visages.
- Le même IPD fixe à 65 mm : il fausse distance et taille de chaque client
  dont l'écart n'est pas 65 mm. **Notre ancrage sur l'iris (11,7 mm) est
  meilleur.**

## B. Notre architecture actuelle (vérifiée dans le dépôt)

Une application Electron dont toute l'interface est **un seul fichier,
`index.html` (5 400 lignes)**, en JavaScript pur avec Three.js 0.160 et
MediaPipe. Il n'y a **ni React, ni Supabase, ni catalogue de 30
morphologies** dans le dépôt : le catalogue est la constante `GLASSES` du
fichier, et la morphologie est un **seul coefficient** (`kTete`, borné
0,85–1,10). Ces trois points du cahier des charges sont donc à créer, pas à
refactorer.

Chaîne actuelle : caméra → recadrage 4:3 unique (`cadrerSource`) →
FaceLandmarker (478 points + matrice de pose) → pose 6 degrés de liberté
(matrice native MediaPipe) → échelle par l'iris → **lissage de pose partagé
(nouveau, build AX)** → monture GLB + occluders (maillage facial, coque,
oreilles, pont, segmentation) → rendu.

## C. Écarts

| Capacité | Visage | NOA aujourd'hui | Changement nécessaire |
|---|---|---|---|
| Pose 6 ddl | oui (boîte noire) | **oui**, matrice MediaPipe | aucun |
| Même pose pour monture et occluders | oui | oui | aucun |
| IPD | 65 mm fixe + saisie manuelle | **iris 11,7 mm**, automatique, ±2 mm | exposer une saisie manuelle (le comptoir mesure déjà la vraie DP) |
| Oreilles | option du suivi | points 234/454 seulement, boîtes d'occlusion | points d'oreille dédiés + repli par modèle de tête |
| Pont du nez | via modèle | nasion + décalage figé | ancrage pont distinct du nasion (en partie fait) |
| Occlusion | masque OBJ unique | **maillage facial + coque + oreilles + segmentation** | niveau supérieur, à ajuster par morphologie |
| Normalisation des modèles | convention écrite (mètres, yeux à Y=0) | `yFix`, `rotFix`, `templeScale` par monture dans le code | **un standard + métadonnées JSON** (existe en partie : `glasses_config.json`) |
| Échelle physique | IPD supposé | iris + marquage optique 49-20-140 | OK |
| Projection caméra | **fixe 36,9°** | **fixe 60° horizontal**, une constante | centraliser et rendre configurable par caméra |
| Lissage | dans le suivi | **un seul rythme** (AX) | aucun |
| Performance | tout sur le fil principal | idem + gouverneur de qualité Q2/Q1/Q0 | worker : optionnel, à mesurer d'abord |
| Perte du visage | téléportation | maintien du dernier visage, point de décision unique | **vraie reprise à chaud**, état explicite |
| Changement de monture | recharge | recharge, pas de cache | cache de modèles |
| Rotation d'écran | tout reconstruire | format 4:3 fixe, indépendant de l'écran | aucun |
| Fuites mémoire | oui (voir A) | non mesuré | banc de longue durée |

### Défauts de notre côté trouvés pendant cet audit (sécurité de la borne)

- `webSecurity: false` dans `main.js` : désactive la protection du
  navigateur. À retirer.
- Pas de `sandbox: true`.
- Rien n'empêche la navigation vers un autre site (`will-navigate`,
  `setWindowOpenHandler` absents).
- La fermeture de la fenêtre n'est pas bloquée en mode borne (les deux
  lignes sont commentées).
- Pas de démarrage automatique au lancement de Windows
  (`setLoginItemSettings`).
- Aucune gestion de `webglcontextlost` / `webglcontextrestored`.
- Aucune reprise si le flux caméra s'arrête (`ended`) ou si la caméra est
  débranchée.

## D. Plan par phases

L'ordre diffère de celui du cahier des charges : on met d'abord ce qui
fait tomber une borne en boutique.

**Phase 0 — Fiabilité de la borne** (`main.js`, `index.html`, `preload.js`)
retirer `webSecurity:false`, ajouter `sandbox:true`, verrouiller la
navigation, bloquer la fermeture en mode borne, démarrage automatique,
reprise caméra avec attente croissante, reprise de contexte WebGL.
*Gain :* une borne qui se répare seule. *Risque :* `sandbox:true` peut
casser le préchargement ; à vérifier au lancement.

**Phase 1 — Repère et caméra** (nouveau `ar/camera.js`)
une seule définition du champ de vision, de la focale et du repère
(axes, unités, origine) ; suppression des constantes dispersées
(`CAM_HFOV_DEG`, `VFOV`, `FOCAL_PX`, `FOCAL_CAM_PX`).
*Risque :* faible, mais touche tout le placement ; à valider par le banc
de glissement et la capture.

**Phase 2 — Pose, état de suivi, reprise à chaud**
machine à états (cherche / acquiert / suit / dégradé / perdu), maintien
bref puis fondu, **sans réinitialiser les filtres** à la perte courte.
Banc : coupures artificielles du visage de 100 à 800 ms.

**Phase 3 — Modèles et cache** (`EyewearAssetCache`, métadonnées)
standard unique de modèle, métadonnées par monture (largeur, charnières,
bouts de branche), cache de GLB, libération explicite (`dispose`) des
géométries, textures et matériaux. Importation validée d'une nouvelle
monture sans toucher au code.

**Phase 4 — Branches et oreilles**
chemin charnière → oreille, rotation des branches autour de la charnière
selon la largeur de tête (déjà partiellement : `applyTempleSplay`).

**Phase 5 — Morphologies**
**dépend de données que je n'ai pas** : les 30 morphologies mentionnées ne
sont pas dans le dépôt. Sans elles, on garde le coefficient mesuré. Dès
qu'elles existent : choix de la plus proche, déformation vers le visage
observé, usage pour occlusion et oreilles.

**Phase 6 — Rendu** matériaux PBR, verres teintés, reflets discrets.
**Phase 7 — Performance** à mesurer d'abord sur le vrai i7 ; worker et
OffscreenCanvas seulement si le fil principal est le goulot.
**Phase 8 — Validation** banc par pose et par lumière, rapport par monture,
test de longue durée.

## E. Ce que je ne peux pas faire ici

- **Le test de 8 à 24 heures** : mon environnement s'arrête bien avant, et
  il n'a ni le GPU, ni la caméra, ni le i7 de la borne. Je peux écrire le
  banc (changements de monture en boucle, remises à zéro, coupure caméra)
  et mesurer la mémoire sur une heure ici ; les 8 heures sont à lancer sur
  une borne.
- **Mesurer le retard réel de bout en bout** : il faut la vraie caméra.
- **Comparer à Visage** : tant que la licence d'évaluation n'est pas là.
