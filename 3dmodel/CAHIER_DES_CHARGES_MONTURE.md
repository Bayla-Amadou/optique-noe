# Cahier des charges : modèle 3D d'une monture pour N.O.A

À donner à la personne ou à l'outil qui fabrique le modèle. Le logiciel ne devine rien :
un modèle qui ne respecte pas ces points sera refusé par `outils/valider-monture.js`.

## 1. Ce qu'on livre

- **`model.glb`** : glTF 2.0 binaire, un seul fichier, textures incluses.
  Pas de FBX, d'OBJ ni de glTF éclaté. **Pas de compression Draco ni Meshopt** (non décodées par l'application).
- **`thumb.png`** ou `thumb.svg` : vignette de la monture, 400 × 300, fond transparent ou uni.
- **Une fiche de dimensions réelles** (mm), prises au pied à coulisse sur la monture physique :
  `lensWidth` (largeur d'un verre), `bridgeWidth` (pont), `templeLength` (longueur d'une branche),
  `frameWidth` (largeur totale de la face), `lensHeight` (hauteur d'un verre). Le marquage gravé
  « 49-20-140 » donne les trois premières.

## 2. Géométrie

- **Proportions exactes** : face et branches à la même échelle. Une face 25 % trop grande par rapport
  aux branches est le défaut le plus fréquent (c'est arrivé à la monture Cube) : le logiciel recale l'échelle
  sur le verre et sur la branche, mais ne corrige pas une face déformée.
- **Orientation (glTF) : Y vers le haut, l'avant de la monture vers +Z, les branches vers −Z.**
- **Symétrique** par rapport à X = 0 (gauche/droite en miroir).
- **Origine** : au milieu du pont (X = 0), au niveau où la monture touche le nez.
- **Branches ouvertes**, droites vers l'arrière, avec le crochet de bout (qui s'incline vers le bas) modélisé.
- Charnières, plaquettes de nez et vis modélisées si elles existent sur la monture réelle.
- Pas de caméra, de lumière, d'animation ni de géométrie cachée à l'intérieur.
- 15 000 à 60 000 triangles ; normales cohérentes (aucune face retournée) ; pas de trous.

## 3. Noms des objets (obligatoires)

Chaque pièce est un objet séparé, nommé exactement :

| Nom | Pièce |
|---|---|
| `R_Lens`, `L_Lens` | les deux verres, **chacun un objet à part** avec son propre matériau |
| `Front` | la face (cerclage et pont) |
| `R_Temple`, `L_Temple` | les deux branches, de la charnière au bout |
| `Pads` | plaquettes de nez (si présentes) |
| `Hinges` | charnières et vis (si présentes) |

Le logiciel rend les verres transparents tout seul : ne pas leur donner de couleur ni de texture.

## 4. Matériaux (PBR métal-rugosité)

- Acétate : `metallic` 0, `roughness` 0,3 à 0,5, couleur de base ou texture de l'écaille.
- Métal : `metallic` 1, `roughness` 0,25 à 0,4.
- Textures : 2048 px au maximum, sRGB pour la couleur ; poids total du fichier **5 Mo ou moins**.

## 5. Contrôle avant livraison

```
node outils/valider-monture.js 3dmodel/<monture>/model.glb --marquage 49-20-140
```

Le code de sortie doit être 0 : unité, taille, centrage, verres nommés, symétrie, écart avec le marquage réel.
Ensuite on ajoute la monture au catalogue de `index.html` avec ses cinq dimensions (`mm`) et `lensMeshNames`.

## 6. Photos nécessaires à partir desquelles modéliser

De face, de profil strict, de dessus, trois quarts, **sur fond uni, à la même distance, avec une règle
ou une pièce de monnaie dans le cadre**, plus la fiche de dimensions. Des photos d'un produit en
catalogue, sans échelle ni profil, ne suffisent pas : les branches et leur crochet y sont invisibles.
