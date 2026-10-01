# N.O.A — Nouvelle Optique Africaine

Borne d'essayage virtuel de lunettes pour boutiques d'optique : suivi du visage
par caméra, monture 3D posée sur la tête du client, ordonnance, paiement mobile
(Wave, Orange Money), dossier envoyé à l'atelier.

## Tableau de bord de la flotte

**https://bayla-amadou.github.io/optique-noe/tableau-de-bord/**

État de chaque borne (en ligne, en retard, hors ligne), alertes (caméra perdue,
envois en attente, mémoire, version en retard), mesures anonymes d'essayage et
ordres à distance. La page est publique mais **ne contient aucune donnée** : elle
affiche une démonstration tant qu'on ne l'a pas connectée à son serveur, et les
vraies données ne passent que par ce serveur, derrière le mot de passe de
l'atelier. Voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md), sections 15 et 16.

## Contenu du dépôt

| | |
|---|---|
| `index.html`, `main.js`, `preload.js` | l'application (Electron), page de la borne |
| `dossier.js`, `flotte.js`, `mesures.js` | dossier client, signes de vie et ordres, mesures anonymes |
| `serveur/` | serveur de dossiers et de la flotte (à héberger sur Hetzner) |
| `tableau-de-bord/` | le tableau de bord (page statique) |
| `3dmodel/` | montures, modèles de suivi, têtes de référence |
| `outils/` | bancs de mesure et outils (`outils/windows/` : installation d'une borne) |
| `DEPLOIEMENT.md` | installation, mode borne, flotte, 24 h sur 24 |
| `ANALYSE_VISAGE.md`, `REPERE.md` | analyse de l'essayage de Visage, repère et caméra |

## Lancer

```bash
npm install
npm start                      # fenêtre normale
npm start -- --borne --diag    # gabarit de la borne, avec le badge de diagnostic
npm start -- --collecte        # avec la collecte de mesures anonymes
```

## Ce qui n'est pas dans ce dépôt, volontairement

Les clés de paiement, la clé partagée avec le serveur, le mot de passe de
l'atelier, le SDK Visage et sa licence : voir `.gitignore`. Le dépôt est public.
