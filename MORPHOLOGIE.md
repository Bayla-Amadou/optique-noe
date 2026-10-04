# Morphologie et validation terrain

Règle de rigueur : **aucune mesure expérimentale n'influence visuellement l'essayage**
tant qu'elle n'a pas été validée sur de vrais utilisateurs. Les morphologies existantes
sont un jeu de référence, pas une limite : la borne mesure la tête de chaque client.

Stack inchangée : Electron + Three.js. Pas d'Unity, pas de FLAME ni de DECA pour
l'instant ; un modèle paramétrique viendra quand il y aura quelques centaines de
mesures réelles pour le construire.

## Déjà opérationnel

- Repères du visage (MediaPipe, 478 points) et pose de la tête (matrice native).
- Mesure actuelle de la largeur de tête, `kTete` : médiane de 40 images de face,
  comparée au gabarit. **C'est la seule mesure individuelle qui agit sur l'essayage** :
  elle règle l'écartement des branches et la taille de l'occulteur.
- Échelle réelle par l'iris, écart pupillaire, forme du visage.
- **N.O.A Morphology Dataset V1** : les têtes H05–H21 reçues (`3dmodel/morphologies/`).
  Ce sont des références pour tester la robustesse du fitting, pas un modèle
  morphologique sénégalais. H01 est à corriger, H02–H04 manquent.
- Fitting actuel des montures : branches écartées en ligne droite de la charnière à
  l'oreille, fondu des branches de −8,5 à −10 cm derrière la face (réglable par borne
  depuis le tableau de bord).
- La profondeur d'oreille de l'essayage est **une constante** : elle ne dépend pas du client.

## En validation (aucun effet sur l'essayage)

`morphologie.js` (testé par `outils/morpho-banc.js`) calcule, en mode `--collecte` et
avec l'accord du client, pour chaque participant : largeur du visage, largeur aux tempes
(totale, droite, gauche), hauteur du visage, largeur du nez, position du pont nasal par
rapport aux pupilles, asymétrie, hauteur des oreilles (si assez fiable), et la distance
**coin externe de l'œil → oreille**, côté droit et côté gauche séparément
(`ear_depth_estimated_right` / `_left`, en mm).

Chaque mesure a un score de confiance de 0 à 1 (`face_width_confidence`,
`nose_bridge_confidence`, `ear_depth_confidence_right` / `_left`…), produit de la quantité
d'images et de la stabilité. Pour l'oreille :
- seule l'oreille la plus proche de la caméra est lue, et seulement entre 15° et 40° de lacet ;
- au-delà de 32° la confiance baisse, à 40° elle est nulle ; en dessous de 15° ou au-delà de 40°, pas d'estimation ;
- tête trop inclinée ou penchée, contour qui danse, ou moins de 20 images : confiance réduite ;
- `ear_depth_usable_*` vaut 1 seulement si la confiance atteint 0,6.

Les angles (lacet, tangage, roulis) au moment de la mesure sont enregistrés
(`measure_*_front_deg`, `ear_yaw_*_deg`).

### Protocole de validation (20 à 30 personnes, 10 mesurées au mètre)

1. Lancer la borne avec `--collecte`. Chaque participant qui accepte voit en haut à droite
   un identifiant anonyme, par exemple `Participant a1b2c3d4`. Il suffit qu'il se mette de
   face, puis tourne légèrement la tête à gauche et à droite (environ 20 à 30°).
2. Pour environ 10 participants, mesurer au mètre, **des deux côtés**, la distance entre le
   coin externe de l'œil et le point de contact de l'oreille (tragus), en mm.
3. Saisir ces mesures dans le tableau de bord : Administration → Qualité d'essayage →
   « Enregistrer la mesure au mètre » (identifiant, droite, gauche).
   **N'écrire aucun nom** : le lien ne passe que par l'identifiant.
4. Exporter (boutons JSON / CSV de la même carte, ou `GET /api/mesures/export`), puis :
   `node outils/validation-oreille.js noa-morphologie.json --seuil 5`
   Fichiers locaux d'une borne : `node outils/validation-oreille.js mesures.ndjson --manuel manuelles.csv`.

L'analyse donne : erreur absolue moyenne, médiane, écart-type, biais, corrélation,
droite contre gauche, erreur selon le lacet, selon la largeur de visage, et si le drapeau
« exploitable » sépare bien les bonnes mesures des mauvaises. Le verdict est indicatif
(`ACCEPTABLE` ou `NON VALIDÉ` avec les raisons) et demande une décision humaine.

### Limites connues

- Les points 234 et 454 sont sur le contour du visage et glissent quand la tête tourne : c'est
  la raison de la limite à 40° et de la validation au mètre.
- Les relevés de profondeur de MediaPipe sont approximatifs ; le banc prouve le calcul sur des
  têtes simulées, pas la précision sur de vrais visages.
- MediaPipe ne donne pas de confiance par repère : la confiance est déduite de la stabilité.

## À venir (rien de tout cela n'est construit)

- **Balayage guidé** face / légère rotation à gauche / à droite, environ 1 s, jamais
  obligatoire au départ. La structure est prête : `observer()` accepte des observations de
  n'importe quelle vue, `fusionner()` rassemble plusieurs sessions d'un même client, et
  `BALAYAGE_GUIDE` décrit les trois étapes. Il améliorera la profondeur du nez, la position
  des tempes et des oreilles, et les asymétries.
- Interpolation entre morphologies de référence.
- Modèle paramétrique appris sur les mesures réelles (quelques centaines minimum).
- Adaptation individuelle des branches, activée progressivement, **seulement après** un
  verdict de validation favorable.

## Vie privée

Seuls des nombres bornés quittent la borne : jamais d'image, jamais de nom. L'identifiant
du participant est tiré au hasard et n'a aucun lien avec une personne. Le client peut
refuser sur l'écran d'accueil ; sa mesure n'est alors pas enregistrée.
