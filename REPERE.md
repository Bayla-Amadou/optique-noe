# Repère, unités et caméra de NOA

Un seul repère pour toute l'application. Si un chiffre n'y rentre pas, c'est
le chiffre qui est faux, pas le repère.

## Repère 3D (celui de la scène Three.js et du solveur de pose)

| | |
|---|---|
| Unité | **centimètre** |
| X | vers le **côté gauche du sujet** |
| Y | vers le **haut** |
| Z | **sort du visage**, vers la caméra. La caméra regarde vers −Z. |
| Origine d'une monture | le **pont du nez** : centre de la monture, au milieu du pont |
| Face de la monture | tournée vers +Z, branches vers −Z |
| Rotation | quaternion en interne ; angles d'Euler ordre YXZ pour l'affichage (lacet, tangage, roulis) |

Ce repère n'a pas été choisi : il est celui du modèle de visage de
MediaPipe, vérifié en extrayant le modèle canonique de `face_landmarker.task`
(nez à z = +7,5 cm, menton à y = −9,4 cm, tête large de 15,3 cm).

## Les deux champs de vision (bloc `CAMERA`, `index.html`)

| | Valeur | D'où elle vient | Sert à |
|---|---|---|---|
| `CAMERA.rendu` | 63° **vertical** | imposée par le solveur de pose de MediaPipe | caméra Three.js, projection pixels ↔ centimètres |
| `CAMERA.objectif` | 60° **horizontal** par défaut | propriété réelle de la webcam | mesure de l'iris, profondeur des tempes |

Le premier ne se règle pas : la matrice de pose est exprimée pour un
objectif de 63°, et notre caméra virtuelle doit lui ressembler. Le second se
règle par borne dans `borne.json` :

```json
{ "camera": { "hfov": 78 } }
```

### Quelle valeur mettre

`hfov` est le champ **horizontal de l'image recadrée en 4:3**, celle que voit
l'application, pas celui du capteur entier. La caméra donne du 16:9 (1920×1080)
et on en garde une bande 4:3 (1440×1080), donc plus étroite.

À partir du champ **diagonal** `D` de la fiche de la caméra :

```
champ horizontal du capteur  = 2 · atan( tan(D/2) · 0,8837 )
champ horizontal du recadrage = 2 · atan( tan(champ capteur / 2) · 0,75 )
```

Exemple : 90° en diagonale → 82,9° au capteur → **67,1°** à mettre.

Une erreur de 10° sur ce réglage ne déplace la largeur mesurée que de 1,5 %.
Pour une vraie précision : calibration au damier, à faire une fois par modèle
de caméra.

## Contrôle

`node outils/projection.js` vérifie que la formule de projection du code
coïncide avec la vraie caméra Three.js (au centre, aux coins, à trois tailles
d'affichage) et qu'aucune autre définition de focale n'existe dans
`index.html`.

## Pourquoi les couches restent alignées sur tout écran

La vidéo, la couche 3D et les occluders vivent dans **un seul repère
800×600**, mis à l'échelle ensemble par le navigateur (`#camZoom`). Le
rapport entre l'image et l'écran n'intervient donc jamais dans le calcul de
pose : changer d'écran, tourner la borne ou zoomer ne peut pas décaler la
monture.
