# Têtes de référence NOA

Convention (celle des fichiers `H01_v7` et suivants) : **millimètres**,
origine au **milieu des deux pupilles**, X vers la **gauche du sujet**, Y vers
le haut, Z vers l'avant du visage, repère direct.

| Fichier | État |
|---|---|
| `H01_NOA.obj` | **Ancienne version**, faite d'ellipsoïdes, origine au centre de la tête. Gardée pour mémoire ; ne pas s'en servir comme occulteur. |
| `H05_H30_robustness_manifest.json` | Paramètres de 26 variantes extrêmes de H01_v7, **pour tester la robustesse, pas pour calibrer** (mots du fichier). Pas de géométrie. |
| `build_calibration_heads.py` | Script qui produit H01_v7 et les têtes H02 (140 mm), H03 (155 mm), H04 (190 mm). Il lit `H01_v6/` et ne tourne que sur la machine d'origine. |

**Manquent encore** : les sorties de ce script, c'est-à-dire les dossiers
`H01_v7`, `H02_narrow_140mm`, `H03_medium_155mm`, `H04_wide_190mm` (chacun un
`.glb` et un `_measurements.json`).

Banc : `node outils/robustesse-tetes.js` confronte le réglage des branches aux
26 têtes du manifeste.
