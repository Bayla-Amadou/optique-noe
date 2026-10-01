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

## Têtes corrigées (`corrige/`)

`node outils/corriger-tete.js 3dmodel/morphologies/H05` écrit dans `corrige/`,
sans toucher aux originaux :

- **`EAR_BOTTOM_L/R` ramenés sur le lobe.** Livrés sur le cou (−97 à −117 mm de
  hauteur). Retrouvés dans le maillage : on descend le long de l'oreille tant
  que la saillie latérale reste au-dessus de la peau du crâne. Vérifié à l'œil
  sur H05, H06 et H19.
- **`NOSE_BRIDGE` ramené sur l'axe** (x = 0).
- Le fichier `_measurements.json` corrigé garde la liste des changements et les
  anciennes valeurs (`corrections`).

**Pas corrigé, car cela relève de la tête de base H01_v7 et non d'un repère :**
la **profondeur de tête** (143 à 150 mm pour 175 à 200 chez un adulte), le
**nez aplati**, et le **maillage rayé au pont du nez**.
