# Comprendre où les clients bloquent

La question posée est : *« pourquoi les clients bloquent au moment du choix ? »*. Il y a trois façons de
le savoir, de la moins coûteuse à la plus lourde. **Commencez par la première** : elle marche déjà, elle
ne filme personne, et elle donne un chiffre là où une vidéo ne donne qu'une impression.

---

## 1. Le journal du parcours — disponible maintenant, sans caméra

La borne compte, pour chaque client : **le temps passé à chaque étape**, **les retours en arrière**, **les
scans d'ordonnance ratés**, et **l'étape où le client s'arrête**.

C'est exactement la réponse à la question. Si les clients bloquent au choix de la monture, la ligne dira
`p_essayage_s: 180` là où elle dit `40` ailleurs. Si beaucoup s'arrêtent à `etape_max: verres`, le
problème est à l'étape 3, pas à l'essayage.

**Ce qui est écrit** (une ligne par client, dans `mesures.ndjson`) :

| Champ | Ce qu'il dit |
|---|---|
| `etape_max` | la dernière étape atteinte : `essayage`, `ordonnance`, `verres`, `paiement`, `confirme` |
| `p_essayage_s` … `p_paiement_s` | secondes passées à chaque étape |
| `p_retours` | combien de fois le client a appuyé sur « Retour » |
| `p_scans_rates` | combien de photos d'ordonnance ont été refusées |
| `monture`, `build`, `participant` | la monture affichée, la version du logiciel, un identifiant tiré au hasard |

**Aucun nom, aucun numéro, aucune photo, aucun montant.** Le fichier est contrôlé champ par champ par
`mesures.js` : un champ non prévu est jeté, même si quelqu'un se trompe en écrivant du code. Rien n'est
écrit tant que le mode collecte n'est pas activé **et** que le client n'a pas accepté.

**Pour l'activer** : `"collecte": true` dans `borne.json`, ou lancer avec `--collecte`.
**Pour le relire** : récupérer `mesures.ndjson` (clé USB ou tableau de bord) ; les lignes de parcours
sont celles qui portent `etape_max`.
**Pour le vérifier** : `node outils/parcours-journal.js <vidéo> <dossier>` contrôle que le journal est
écrit correctement, et qu'il n'est **pas** écrit hors mode collecte.

Comptez une à deux semaines de vrais clients avant d'en tirer quoi que ce soit : à dix clients, on lit
du hasard.

---

## 2. L'enregistrement d'écran — quand le journal montre *où*, mais pas *pourquoi*

Le journal dit que les clients passent trois minutes à l'étape 3. Il ne dit pas s'ils lisent, s'ils
hésitent entre deux verres, ou s'ils cherchent un bouton qui n'existe pas. L'enregistrement d'écran le
montre.

C'est la méthode des études publiées sur les bornes de commande en restauration rapide et les bornes de
cinéma : on filme l'écran pendant que la personne s'en sert, on chronomètre chaque tâche, et on fait
remplir un court questionnaire à la fin. Les bornes de cinéma mesurées ainsi obtenaient 54 à 62 sur 100
au questionnaire SUS — en dessous de ce qu'on considère utilisable. Mieux vaut le savoir avant d'en
installer dix.

**Comment faire, simplement** : sur la borne Windows, l'enregistreur intégré (touche Windows + G) filme
l'écran sans rien installer. Enregistrez par sessions courtes, pas en continu : on ne regarde jamais
huit heures de vidéo.

---

## 3. La caméra d'observation — en dernier, et sous conditions

Filmer le client lui-même (ses mains, son visage, ses hésitations) apporte ce que l'écran ne montre pas :
le moment où il se recule, où il cherche quelqu'un du regard, où il abandonne. C'est aussi le plus
intrusif, et c'est **un traitement de données personnelles**.

**Au Sénégal**, cela relève de la loi 2008-12 et de la **CDP** (Commission de protection des données
personnelles). Avant de brancher quoi que ce soit :

1. **Déclarer** le traitement auprès de la CDP, en disant la finalité (améliorer l'interface), la durée
   de conservation et qui a accès aux images.
2. **Afficher** un panneau visible **avant** la zone filmée : ce qui est filmé, pourquoi, pendant
   combien de temps, et comment demander l'effacement.
3. **Demander l'accord** de chaque personne filmée, et prévoir une borne ou un créneau non filmé pour
   qui refuse.
4. **Limiter la durée** : quelques jours, le temps de l'analyse, puis effacement. Une caméra qui tourne
   en permanence et garde tout n'est plus une étude, c'est de la surveillance.
5. **Restreindre l'accès** : deux personnes nommées, pas le disque partagé de la boutique.

Si l'objectif est seulement de comprendre l'interface, **une phase courte avec des volontaires prévenus
donne presque tout**, sans filmer les clients de passage.

---

## 4. Le protocole qui donne des réponses en une après-midi

Vous n'avez pas besoin de centaines de clients. Cinq à huit personnes suffisent à faire ressortir la
plupart des blocages d'une interface.

1. **Recrutez 5 à 8 personnes** qui ressemblent à vos clients : au moins deux de plus de soixante ans,
   au moins deux qui ne lisent pas couramment le français, au moins une qui n'a jamais utilisé de borne.
2. **Donnez une tâche, pas un mode d'emploi** : « Vous voulez des lunettes de vue. Faites comme si
   j'étais pas là. » Puis **taisez-vous** — c'est la partie difficile.
3. **Demandez de penser à voix haute** : « dites tout ce qui vous passe par la tête ».
4. **Notez trois choses** : où la personne s'arrête, ce qu'elle dit à ce moment-là, et si elle y arrive
   seule. Rien d'autre.
5. **À la fin, dix questions** (questionnaire SUS, cinq minutes) pour avoir un chiffre comparable entre
   deux versions du logiciel.
6. **Refaites-le** après les corrections, avec d'autres personnes. C'est la comparaison qui compte.

Croisez ensuite avec le journal du parcours : si les volontaires bloquent là où le journal montre les
temps les plus longs, vous tenez votre réponse.

---

## Sources

- [Usability Evaluation of Self-Ordering Kiosks in Fast Food Restaurants](https://openaccess-api.cms-conferences.org/articles/download/978-1-958651-86-5_31) — essais menés dans de vrais restaurants, écrans tactiles verticaux de 21,5 pouces (le format de notre borne), comportement et temps enregistrés, puis questionnaires SUS et QUIS. Une des trois bornes testées souffrait de lenteurs d'affichage.
- [Usability Evaluation of Self-Service Ticketing Kiosks in Cinemas](https://www.researchgate.net/publication/372283870_Usability_Evaluation_of_Self-Service_Ticketing_Kiosks_in_Cinemas) — toute la manipulation est enregistrée, puis tâche chronométrée et questionnaires. Scores SUS de 62,5, 56 et 54,5 sur 100.
- [Eliciting positive user experiences with self-service kiosks](https://www.researchgate.net/publication/269935731_Eliciting_positive_user_experiences_with_self-service_kiosks_Pursuing_possibilities) — ce qui fait qu'une borne est vécue comme agréable et non comme une corvée.
- [The adoption of self-service kiosks in quick-service restaurants](https://www.researchgate.net/publication/358790565_The_adoption_of_self-service_kiosks_in_quick-service_restaurants) — ce qui décide les clients à utiliser une borne plutôt qu'un comptoir.

À noter : ces travaux filment des volontaires prévenus dans un cadre d'étude. Je n'ai pas trouvé d'étude
publiée qui filme en continu les clients d'une boutique — ce qui est cohérent avec le point 3 ci-dessus.
