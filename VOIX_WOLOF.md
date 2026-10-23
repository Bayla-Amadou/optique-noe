# Assistance vocale en wolof

La borne s'adresse à des clients qui ne lisent pas toujours le français, surtout des personnes âgées.
**La voix est donc d'abord en wolof.** L'interface reste en français ; le client peut choisir
**Wolof** ou **Français** pour la voix avec le sélecteur en haut à droite.

## Ce que fait la borne

- **Bouton « Écouter les instructions »** (icône haut-parleur), toujours visible en haut à droite :
  il redit la consigne de l'étape en cours, autant de fois que le client le souhaite.
- **Sélecteur Wolof / Français** : le wolof est la langue de départ pour chaque nouveau client.
- **Interrupteur de la voix** (petit haut-parleur) : coupe la dite automatique des consignes. Le bouton
  « Écouter » reste utilisable à la demande. Ce réglage est celui de la boutique (il est conservé).
- **À chaque étape**, la consigne se dit toute seule : essayage, ordonnance, scan, verres, paiement
  (Wave ou Orange Money), remerciement. À l'écran d'accueil, rien ne se dit tout seul : le bouton suffit.

## Le point important : les enregistrements

**Aucune voix de synthèse n'est utilisée pour le wolof.** Une traduction vocale automatique non vérifiée
donnerait un wolof faux ou artificiel, ce qui serait pire que se taire. Les consignes wolof sont donc des
**enregistrements faits (ou validés) par un locuteur natif**, déposés comme fichiers audio :

    assets/voix/wo/<identifiant>.mp3        (ou .ogg / .wav)

**Tant qu'un enregistrement wolof manque**, la borne dit cette consigne **en français** (fichier
`assets/voix/fr/<identifiant>.mp3` s'il existe, sinon la voix de synthèse française de Windows). Elle ne
parle jamais un wolof inventé. Pour voir ce qu'il reste à enregistrer :

    node outils/voix-manque.js            rapport
    node outils/voix-manque.js --strict   erreur si un enregistrement wolof manque (avant de livrer une borne)

## Les 9 consignes à enregistrer

La colonne « Brouillon wolof » est un **point de départ de travail rédigé sans locuteur natif : il peut
contenir des erreurs de langue et ne doit PAS être enregistré tel quel.** Le locuteur le corrige ou le
remplace par ce qu'il dirait naturellement à une personne âgée. Garder des phrases courtes.

| Fichier (`assets/voix/wo/…`) | Quand | Français (référence) | Brouillon wolof — à corriger |
|---|---|---|---|
| `accueil.mp3` | bouton « Écouter » sur l'accueil | Bienvenue. Touchez le bouton pour commencer l'essayage. | Dalal ak jàmm. Laal butoŋ bi ngir tàmbali. |
| `essayage.mp3` | début de l'essayage | Approchez-vous de la caméra. Regardez l'écran. Choisissez la monture qui vous plaît. | Jegeleel kamera bi. Xool ekraŋ bi. Tànnal lunet bi nga bëgg. |
| `ordonnance.mp3` | page du scan d'ordonnance | Placez votre ordonnance devant la caméra. | Teg ordonaas bi ci kanam kamera bi. |
| `scan.mp3` | quand le client lance la prise | Patientez pendant le scan. | Muñal tuuti. |
| `scan_echec.mp3` | la photo de l'ordonnance est illisible (floue, sombre, reflet, sans texte) | L'ordonnance n'est pas lisible. Recommencez : tenez-la bien droite, à la lumière. | Ordonaas bi dootul xam-xam. Tàmbalileel : jàpp ko ci kanam, ci leer. |
| `verres.mp3` | page des verres et du paiement | Choisissez vos verres : lumière bleue, ou photochromiques. | Tànnal say verre : yu aar gën ci leeru ekraŋ, walla yu lëndëm ci jant. |
| `paiement_wave.mp3` | écran de paiement Wave | Scannez le QR code avec Wave pour payer. | Skaanal kood QR bi ak Wave ngir fey. |
| `paiement_orange.mp3` | écran de paiement Orange Money | Scannez le QR code avec Orange Money pour payer. | Skaanal kood QR bi ak Orange Money ngir fey. |
| `merci.mp3` | commande enregistrée | Merci. Votre commande est enregistrée. | Jërëjëf. Sa commande bi dugg na. |

Les textes français de référence sont dans `voix.js` (`CONSIGNES`). Pour ajouter une consigne : l'ajouter
là, l'appeler depuis la page (`voix('identifiant')`), puis enregistrer le fichier. `node outils/voix-banc.js`
vérifie que chaque consigne existe et est déclenchée quelque part.

## Le fichier de voix reçu (ElevenLabs, « Mariama »)

Le fichier de 64 secondes envoyé pour la borne est une **voix de synthèse** (ElevenLabs), pas un enregistrement
d'une personne. Il a été découpé aux silences en **27 phrases** (`assets/voix/wo-phrases/p01.mp3` à `p27.mp3`,
regroupées en 13 blocs ; l'original est dans `assets/voix/wo-source/`).

Avant de s'en servir en boutique :
1. **Validation par un locuteur wolof natif** : le texte dit, la prononciation, le ton. C'est la condition posée plus haut.
2. **Licence** : vérifier que l'abonnement ElevenLabs autorise l'usage commercial de cette voix sur une borne.

Pour affecter les phrases aux consignes : la page « Découpe voix wolof » (liste, écoute, choix de la consigne pour
chaque phrase) produit un texte du genre `scan_echec: 12, 13`. Puis :

    node outils/voix-installer.js "essayage: 3, 4, 5
    scan_echec: 12, 13"

Cela assemble `assets/voix/wo/<consigne>.mp3` (ffmpeg requis sur la machine de développement). `--a-blanc`
montre ce qui serait fait sans rien écrire. Contrôle ensuite : `node outils/voix-manque.js`.

## Ordonnance illisible : ce que la borne détecte

Après la photo, `ordonnance.js` (`lisibilite`) mesure la zone du cadre : **floue**, **trop sombre**, **reflet**,
**texte trop pâle**, **pas de texte**. Si la photo est refusée, l'écran dit pourquoi, la voix `scan_echec` se
déclenche, la détection automatique est mise en pause 4,5 s, et le client recommence. **Au 3e essai raté la photo
est gardée** (un client ne reste pas bloqué) et le dossier porte la mention « Ordonnance à vérifier : photo peu
lisible ». Seuils réglés sur un texte réel rendu avec flou, obscurité et reflet ; **à valider sur la borne avec la vraie
caméra et de vraies ordonnances** avant de s'y fier.

## Conseils d'enregistrement

- Un locuteur natif, voix posée, un peu plus lente que la conversation ; un même locuteur pour toutes les
  consignes.
- Endroit calme, micro proche, sans écho. Un fichier par consigne, **moins de 15 secondes**, mono,
  44,1 kHz, MP3 128 kbit/s. Niveau sonore régulier d'un fichier à l'autre.
- Après dépôt des fichiers : `node outils/voix-manque.js --strict`, puis essai sur la borne avec le vrai
  haut-parleur, à bonne distance, dans le bruit de la boutique.

## À ne pas oublier

- Le texte **affiché** reste en français : l'écran ne montre aucun wolof écrit non validé.
- Le haut-parleur de la borne (5 W) doit être réglé pour être entendu en boutique : à vérifier sur place.
