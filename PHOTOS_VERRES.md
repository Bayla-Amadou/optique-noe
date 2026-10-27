# Les photos des cartes de verres

À l'étape 3, chaque type de verre porte une vignette. Une **vraie photo** dit en une seconde ce
qu'une phrase met trois lignes à expliquer — et surtout, elle parle à un client qui lit mal le
français. C'est le but.

## Où elles vivent

    assets/verres/<nom>.webp        carré, 360 × 360, moins de 20 Ko

| Fichier | Carte | État |
|---|---|---|
| `pres.webp` | Vision de près | **en place** |
| `progressif.webp` | Verres progressifs | **en place — à remplacer, voir les droits** |
| `loin.webp` | Vision de loin | **manque** → dessin en attendant |
| `blanc.webp` | Verres blancs anti-reflet | **manque** → dessin en attendant |
| `photogray.webp` | Verres photochromiques | **manque** → dessin en attendant |

**Pour installer une photo** : la recadrer en carré sur le visage et les lunettes, l'enregistrer
sous le bon nom dans `assets/verres/`, puis remplacer le `<svg>` de la carte dans `index.html` par :

```html
<span class="vopt-anim"><img src="assets/verres/loin.webp" alt="" loading="lazy" decoding="async"></span>
```

Rien d'autre à changer : la vignette garde sa taille et ses coins arrondis.

---

## ⚠️ Les droits — à régler avant l'ouverture

**`progressif.webp` doit être remplacée.** Elle vient de celles que ChatGPT a proposées, et ChatGPT
a lui-même écrit qu'il s'agissait de **« références visuelles, pas encore les images définitives »**.
Une photo trouvée en ligne est presque toujours sous licence : l'afficher sur une borne commerciale
sans l'avoir achetée expose à une réclamation, et la facture arrive longtemps après.

Trois façons d'être tranquille, de la meilleure à la moins bonne :

1. **Photographier vous-mêmes**, en boutique, avec des personnes qui signent une autorisation
   d'utilisation de leur image. C'est aussi ce qui ressemblera le plus à vos clients.
2. **Acheter une licence commerciale** sur une banque d'images (Getty, Adobe Stock, Shutterstock) —
   une dizaine d'euros par image, et gardez la facture.
3. **Images libres** (Unsplash, Pexels) : gratuites, mais vérifiez que la personne photographiée a
   bien donné son accord — la licence couvre la photo, pas toujours le visage.

Au Sénégal, le droit à l'image d'une personne identifiable exige son accord **écrit** dès lors que
l'usage est commercial. Une photo = une autorisation signée, conservée.

---

## Ce qu'il reste à photographier

Même cadre pour toutes : **portrait serré**, le visage et les lunettes bien visibles, lumière
naturelle, la personne occupée à quelque chose de vrai. Pas de pose figée face à l'objectif, pas de
studio blanc. Des personnes sénégalaises, et au moins une de plus de soixante ans.

**1. `loin.webp` — Vision de loin**
Quelqu'un dans la rue qui regarde au loin : une enseigne, un bus qui arrive, quelqu'un qu'il
reconnaît. Lunettes sur le nez, regard dirigé vers l'horizon, pas vers l'objectif.

**2. `blanc.webp` — Verres blancs anti-reflet**
Un visage de trois quarts, en lumière douce, où l'on voit **les yeux à travers le verre** sans le
moindre reflet. C'est tout le propos : le verre ne se voit pas, les yeux se voient. Évitez une
fenêtre dans le dos du photographe, qui mettrait justement un reflet sur le verre.

**3. `photogray.webp` — Verres photochromiques**
La même personne dehors en plein soleil, verres foncés. Si vous pouvez, prenez aussi la même
personne à l'intérieur, verres clairs : le couple des deux images raconte tout, et on pourra les
alterner sur la carte.

Les deux déjà en place (`pres`, `progressif`) montrent une personne qui lit son téléphone. Gardez
cette idée pour les trois autres : une personne, une action, les lunettes visibles.
