# Monture N.O.A 53-16-137 — prototype issu de photos

- `model.glb` : glTF 2.0 binaire, sans compression, en mètres. Validé par `outils/valider-monture.js`
  (verre 53,7 mm pour 53, pont 15 pour 16, branche 3 % d'écart) : « acceptable avec réserves ».
- `anchors.json` : points d'ancrage (pont, centres de verre, charnières, bouts de branche). Non lus
  par N.O.A pour l'instant.
- `source/generate_model.py` : script qui régénère la géométrie (Python, numpy, scipy).

**Dimensions** : marquage 53-16-137 rapporté à la main. Largeur de face 140 mm (estimation, Mesures
iPhone) et hauteur de verre 37 mm (estimée sur photos) : **à mesurer au pied à coulisse** sur la monture réelle.
**Limites** : courbures, épaisseurs, plaquettes et charnières approximatives ; aucune texture ; embouts
jaunes d'après les photos ; pas de logo. C'est une forme d'essai, pas un modèle certifié pour mesurer l'ajustement.
