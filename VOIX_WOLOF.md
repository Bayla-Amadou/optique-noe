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

## Les 12 consignes à enregistrer

La colonne « Brouillon wolof » est un **point de départ de travail rédigé sans locuteur natif : il peut
contenir des erreurs de langue et ne doit PAS être enregistré tel quel.** Le locuteur le corrige ou le
remplace par ce qu'il dirait naturellement à une personne âgée. Garder des phrases courtes.

| Fichier (`assets/voix/wo/…`) | Quand | Français (référence) | Brouillon wolof — à corriger |
|---|---|---|---|
| `accueil.mp3` | écran d'accueil, bouton « Écouter » | Bienvenue. Touchez le bouton pour commencer l'essayage. | Dalal ak jàmm. Laal butoŋ bi ngir tàmbali. |
| `bienvenue.mp3` | **le client vient d'appuyer sur « Commencer »** — saluer, sans lui redemander d'appuyer | Bonjour, et bienvenue chez N.O.A. | Salaam aleekum, dalal ak jàmm ci N.O.A. |
| `essayage.mp3` | étape 1 : choisir la monture | Approchez-vous de la caméra. Regardez l'écran. Choisissez la monture qui vous plaît. | Jegeleel kamera bi. Xool ekraŋ bi. Tànnal lunet bi nga bëgg. |
| `ordonnance.mp3` | étape 2 : la photo de l'ordonnance | Placez votre ordonnance devant la caméra. | Teg ordonaas bi ci kanam kamera bi. |
| `scan.mp3` | la photo est lisible et acceptée | Le scan est réussi. | (enregistrement fourni) |
| `scan_echec.mp3` | la photo est illisible (pas de feuille, floue, sombre, reflet) | L'ordonnance n'est pas lisible. Recommencez : tenez-la bien droite, à la lumière. | Ordonaas bi dootul xam-xam. Tàmbalileel : jàpp ko ci kanam, ci leer. |
| `verres.mp3` | étape 3 : les verres et les coordonnées | Choisissez vos verres, puis donnez votre nom et votre numéro. | Tànnal say verre, ba noppi joxe sa tur ak sa nimero. |
| `paiement.mp3` | étape 4 : le moyen de paiement | Choisissez Wave ou Orange Money pour payer. | **à enregistrer** : nouvelle étape |
| `paiement_wave.mp3` | écran de paiement Wave | Scannez le QR code avec Wave pour payer. | Skaanal kood QR bi ak Wave ngir fey. |
| `paiement_orange.mp3` | écran de paiement Orange Money | Scannez le QR code avec Orange Money pour payer. | Skaanal kood QR bi ak Orange Money ngir fey. |
| `paiement_echec.mp3` | le paiement est refusé ou a expiré | Le paiement n'a pas abouti. Recommencez. | **à enregistrer** |
| `merci.mp3` | commande confirmée | Merci. Votre commande est enregistrée. | Jërëjëf. Sa commande bi dugg na. |

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

Après la photo, `ordonnance.js` (`lisibilite`) vérifie, dans la zone du cadre : **une feuille est bien là** (claire,
peu colorée : un mur, un visage ou un vêtement ne passent pas), **des lignes de texte**, et que la photo n'est ni
**floue**, ni **trop sombre**, ni **éblouie par un reflet**, ni **trop pâle**. Si elle est refusée, l'écran dit
pourquoi, la voix `scan_echec` se déclenche, la détection automatique est mise en pause 4,5 s et le client recommence.
**Il n'y a pas de passage en force** : le bouton « Continuer » reste grisé tant que l'ordonnance n'est pas lisible. Au 3e
essai raté, le message ajoute « Demandez l'aide d'un conseiller ». Seuils réglés sur un texte réel rendu avec flou,
obscurité et reflet, et sur deux visages : **à valider sur la borne avec la vraie caméra et de vraies ordonnances**,
y compris manuscrites, qui risquent d'être refusées à tort.

## Script complet à enregistrer, dans l'ordre du parcours

Le parcours compte maintenant **quatre étapes** : essayage, ordonnance, verres, paiement. Voici le script
dans l'ordre où le client l'entend, prêt à être lu par le locuteur. Chaque ligne est **un fichier**.

1. `accueil` — *(l'écran d'attente ; dite seulement si on touche « Écouter »)* « Bienvenue chez N.O.A. Touchez le bouton pour essayer vos lunettes. »
2. `bienvenue` — *(il vient d'appuyer)* « Bonjour, et bienvenue chez N.O.A. »
3. `essayage` — « Approchez-vous de la caméra et regardez l'écran. Choisissez la monture qui vous plaît. »
4. `ordonnance` — « Maintenant, placez votre ordonnance devant la caméra, bien à plat. »
5. `scan` — « C'est bon, l'ordonnance est enregistrée. »
6. `scan_echec` — « Je ne lis pas votre ordonnance. Recommencez : tenez-la bien droite, à la lumière. »
7. `verres` — « Choisissez vos verres, puis donnez votre nom et votre numéro de téléphone. »
8. `paiement` — « Choisissez Wave ou Orange Money pour payer. »
9. `paiement_wave` — « Scannez le QR code avec Wave pour payer. »
10. `paiement_orange` — « Scannez le QR code avec Orange Money pour payer. »
11. `paiement_echec` — « Le paiement n'a pas abouti. Recommencez. »
12. `merci` — « Merci ! Votre commande est enregistrée. Vous recevez un SMS tout de suite. »

**Deux règles pour le locuteur :** ne jamais dire « appuyez sur commencer » ailleurs que dans `accueil`
(partout ailleurs le client a déjà appuyé), et ne jamais annoncer un prix ni un délai, qui changent.

Une seule prise, en wolof, dans cet ordre, avec une respiration nette entre chaque ligne : le découpage
se fait ensuite tout seul (`outils/voix-installer.js`).

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
