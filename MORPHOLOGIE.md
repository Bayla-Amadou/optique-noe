# Morphologie : mesurer chaque client, apprendre des têtes rencontrées

**Principe retenu** : on ne cherche pas « la tête de référence la plus proche ».
La borne mesure la tête de chaque client, et les mesures anonymes (nombres
seulement, avec son accord) remontent au serveur. Les têtes H01–H30 servent de
jeu d'essai, pas de limite : aucune forme n'est exclue.

## Ce qui est fait (build `BS`)

- `index.html` : en mode collecte, chaque détection est exprimée dans le repère
  de la tête (cm), par vue : de face, trois quarts gauche, trois quarts droit.
  Médiane par vue, puis : largeur des tempes, hauteur du visage, largeur du nez,
  asymétrie, **profondeur des oreilles derrière les pupilles**.
- `mesures.js` (+ copie serveur) : champs bornés ; rien d'autre ne passe.
- `serveur/serveur.js` : `/api/mesures/stats` renvoie la répartition (`morpho`).
- Tableau de bord, Qualité d'essayage : carte « Morphologies mesurées ».
- `outils/morpho-banc.mjs` : tête simulée de dimensions connues, retrouvées à
  0,1 cm près (largeur, hauteur, nez, oreille).

## Ce qui n'est PAS fait

- **L'essayage n'utilise pas encore ces mesures** : la profondeur d'oreille du
  fondu des branches reste le réglage global (−8,5 / −10 cm).
- La profondeur d'oreille estimée repose sur le relief que MediaPipe donne aux
  points 234 et 454, qui sont sur le contour du visage : ils glissent quand la
  tête tourne. **L'estimation est à valider** contre une mesure au mètre sur
  quelques clients (œil à tragus) avant d'en piloter les branches.
- Pas encore de balayage guidé « de face, à gauche, à droite » avant l'essayage,
  ni de modèle paramétrique de tête.

## Suite, dans l'ordre

1. Activer la collecte sur une borne, mesurer 20 à 30 clients ; en plus, mesurer
   au mètre la distance coin externe de l'œil → tragus sur 10 d'entre eux.
2. Comparer au tableau de bord : si l'estimation suit la mesure au mètre,
   brancher la profondeur d'oreille individuelle sur le fondu des branches.
3. Balayage guidé d'une seconde (face, gauche, droite) pour que chaque client
   fournisse assez de vues de côté.
4. Quand on a quelques centaines de mesures : modèle paramétrique (quelques
   coefficients de forme appris sur ces mesures) pour déformer la tête
   d'occultation. Il n'y a ni Unity ni FLAME dans la pile : N.O.A est en
   Electron et Three.js.
