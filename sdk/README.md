# N.O.A AR SDK

SDK AR de niveau commercial pour essayage virtuel de lunettes.

## Architecture

```
sdk/
├── filters.js          One Euro Filter (Casiez 2012)
├── calibration.js      Caméra pinhole, ancres canoniques, mesure PD
├── faceGeometry.js     Wrapper MediaPipe Tasks Vision FaceLandmarker
├── tracking.js         Tracker 6DOF (matrice + ancre + filtres)
├── glassesRenderer.js  Three.js renderer + chargement GLB (échelle cm)
├── occlusion.js        Face occlusion mesh (depth-only)
└── noaSDK.js           Point d'entrée orchestrateur
```

## Pipeline

```
Video → FaceGeometry → { landmarks, 4×4 matrix }
                            │
                            ▼
                       HeadTracker
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
       Sellion anchor   Euler YXZ      PD inter-iris
       (cm canonical)   no clamp       → scale factor
                            │
                            ▼
                       OneEuro Filter
                            │
                            ▼
                  GlassesRenderer + FaceOcclusion
                            │
                            ▼
                          Three.js
```

## Caractéristiques

- **Scène en centimètres** : cohérent avec MediaPipe (matrice en cm)
- **FOV calibré 63° vertical** : matche les hypothèses internes MediaPipe
- **Yaw illimité** : extraction Euler depuis quaternion, aucun `Math.max/min`
- **Ancrage canonique** : sellion à `(0, 1, 6) cm` dans repère face, transformée
  par la matrice → position correcte même à 90°
- **Échelle physique** : PD réelle (iris 468 / 473) / 6.3 cm → la monture conserve
  sa taille quand l'utilisateur s'approche/s'éloigne
- **One Euro Filter** par axe : cutoff adaptatif (stable + réactif)
- **Occlusion depth-only** : mesh facial fermé écrit dans le z-buffer, branches
  derrière la tête masquées automatiquement

## Usage

```js
import { NoaSDK } from './sdk/noaSDK.js';

const sdk = new NoaSDK({
  video:  document.getElementById('cam'),
  canvas: document.getElementById('gl'),
  width: 640, height: 480,
});

sdk.onStatus = state => console.log(state);  // 'searching' | 'tracking' | 'lost'

await sdk.init();
await sdk.setGlasses({
  path: '3dmodel/upload-01/',
  model: 'glasses.glb',
  rotFix: [0, 0, 0],
  yFix: 0,                                   // mm
  mm: { frameWidth: 138, lensWidth: 52, bridgeWidth: 18, templeLength: 145 },
});

sdk.setTint('#60707e', 0.48);
sdk.start();
const png = sdk.capture();
sdk.stop();
```
