# Diagnostic et comparaison N.O.A / Visage SDK

Date : 4 octobre 2026 · build `BQ` · aucun code modifié pour ce document.

**Ce qui est mesuré et ce qui ne l'est pas.** Les chiffres de la partie 2 sortent
de bancs de test lancés pour ce document. La partie 1 compare des capacités
vérifiables (documentation et exemple de Visage, code de N.O.A). **La précision
de suivi réelle des deux moteurs n'a pas été mesurée** : on n'a ni exécuté
Visage (licence en erreur 0x00001000 dans notre environnement, test sur Mac
abandonné), ni analysé de trace sur la borne. Aucun pourcentage de « précision »
n'est donc donné : il serait inventé.

## 1. Couverture fonctionnelle (ce que le projet demande)

Poids = importance pour N.O.A. Score = part de la capacité de Visage que N.O.A
réalise (100 = équivalent ou meilleur).

| Capacité | Poids | Visage SDK | N.O.A | Score | Remarque |
|---|---|---|---|---|---|
| Suivi de la pose 6 degrés de liberté, temps réel | 25 | oui (moteur propriétaire) | oui (MediaPipe, 478 points, matrice de pose) | 100 | présence seulement, précision non mesurée |
| Échelle métrique du visage | 10 | écart pupillaire supposé 65 mm | iris 11,7 mm, automatique | 100 | meilleur chez nous |
| Branches derrière la tête et l'oreille | 15 | un masque 3D unique | occulteur facial + fondu en profondeur + écartement droit | 90 | profondeur d'oreille fixe, 8 têtes sur 30 reçues |
| Perte et reprise du visage | 10 | reprise 0,8 s, sinon monture téléportée | maintien 1,2 s puis fondu, filtres conservés | 100 | meilleur chez nous |
| Robustesse 24 h / 24 (mémoire, caméra, GL) | 10 | fuites relevées dans l'exemple | fuites corrigées, reprise caméra et GL | 100 | non testé 8 h sur matériel réel |
| Genre | 15 | oui (`AnalysisData.gender`) | oui (face-api, une analyse au démarrage) | 70 | précision non mesurée, modèle séparé du suivi |
| Âge | 3 | oui | oui (même modèle) | 70 | |
| Regard | 2 | oui (`ScreenSpaceGazeData`) | non | 0 | non demandé |
| Émotions | 0 | oui | non | — | tu ne le demandes pas |
| Plateformes (Windows, Mac, Linux, Android, iOS, web) | 5 | 6 | Windows et Mac (Electron) | 40 | suffisant pour une borne |
| Support éditeur, certification | — | oui | non | — | hors périmètre |

**Résultat : environ 83 % du périmètre utile à N.O.A est couvert**
(somme pondérée : 25 + 10 + 13,5 + 10 + 10 + 10,5 + 2,1 + 0 + 2 = 83,1 sur 100).
Ce chiffre dit « avons-nous la même chose », pas « est-ce aussi précis ».
Les 17 points manquants : genre/âge à fiabiliser, regard, plateformes, 22 têtes
sur 30 non livrées pour l'ajustement par morphologie.

## 2. Mesures faites pour ce document

| Banc | Résultat |
|---|---|
| Glissement de la monture, hochement vif ±20° à 1,5 Hz | moyenne 1,9 px, 95 % des images sous 4,2 px, angle 0,6° (avant le lissage partagé : 5,6 px, 4,8°) |
| Glissement, « non » de la tête ±30° | moyenne 1,8 px, 95 % sous 3,6 px, angle 0,6° |
| Tête immobile | moyenne 1,3 px, 95 % sous 2,5 px |
| Projection caméra | écart maximal 1,3e-13 px entre la formule et Three.js ; aucune focale hors du bloc CAMERA |
| Mise à jour automatique | 38 contrôles réussis |
| Serveur, pilotage, sauvegarde | 3 bancs réussis ; copie relue, intégrité ok |
| Banc de précision du suivi (auto-test) | retard retrouvé 85 ms pour 86 attendus |
| Banc de coupures (100 à 800 ms) | non relancé ici (dépendance manquante dans cet environnement) |

Limite : ces bancs rejouent des mouvements **synthétiques** dans nos filtres. Ils
mesurent le lissage, pas la qualité du détecteur sur un vrai visage.

## 3. Ce qu'il faut pour un vrai pourcentage de précision

1. Une trace de 60 s enregistrée sur la borne (`--trace=60`, voir `README.md`),
   analysée par `outils/precision-suivi.js` : tremblement tête immobile, retard,
   part d'images sans visage.
2. Un point de comparaison pour Visage : soit les chiffres de précision de
   l'éditeur (à demander à Visage Technologies, qui les publie pour ses clients),
   soit un passage de l'exemple Visage sur la même vidéo, ce qui suppose que la
   licence d'évaluation fonctionne.
3. Un test de 8 à 24 h sur la borne pour la robustesse.

## 4. Points faibles connus de N.O.A

- Profondeur d'oreille fixe (fondu de −8,5 à −10 cm) : réglée sur un seul visage.
- Morphologies : 8 têtes sur 30 ; H01 à corriger, H02 à H04 manquantes.
- Genre et âge : modèle séparé, une seule image au démarrage, non évalué.
- Performance sur le processeur de la borne : jamais mesurée.
- Aucun test sur GPU, vraie caméra de la borne ou Windows par moi.
