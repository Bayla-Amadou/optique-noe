# La carte RFID de la borne

La borne HN-27SK-F est livrée avec un lecteur RFID. Ce document dit **ce qu'on peut en faire**, ce
qui est déjà en place, et comment savoir en deux minutes quel lecteur vous avez réellement.

---

## D'abord : à quoi sert une carte RFID, et à quoi elle ne sert pas

Une carte RFID porte **un numéro, et rien d'autre**. Ce numéro se lit à travers une poche, et il se
**recopie** avec n'importe quel lecteur à vingt euros. Ce n'est donc pas un secret, pas une
signature, pas une preuve d'identité. C'est un **raccourci** : quelque chose qu'on présente au lieu
de taper.

Cela élimine tout de suite une idée qu'on a toujours en premier : **non, on ne peut pas encaisser
avec.** Le paiement sans contact d'une carte bancaire n'est pas du RFID ordinaire — il demande un
terminal certifié par la banque, avec ses clés et son agrément. Le lecteur de la borne n'en est pas
un, et aucun logiciel ne peut l'y transformer.

---

## Ce qui est en place : la carte du personnel

**Le problème qu'elle résout.** Une fois en mode borne, l'application ne se quitte plus : c'est
voulu, un client ne doit pas pouvoir en sortir. La seule issue était **Ctrl + Alt + Maj + Q**… et
une borne en boutique n'a pas de clavier.

**La solution.** Un opticien passe sa carte devant le lecteur, la borne se ferme. Pas de clavier,
pas de mot de passe affiché devant les clients, pas de manipulation visible.

**Pour l'activer**, dans `borne.json` :

```json
"badges": ["0008234567", "0008234590"]
```

Pour connaître le numéro d'une carte : lancez la borne avec `--diag`, passez la carte, le badge de
diagnostic en haut à droite affiche `carte 0008234567 inconnue`. Recopiez ce numéro dans la liste.
Liste vide = pas de sortie par carte, la borne se comporte comme avant.

**Ce qu'une carte ne peut PAS faire, volontairement :** ouvrir un dossier client, valider un
paiement, changer un réglage. Puisque le numéro se recopie, on ne lui confie rien qui coûte de
l'argent ni rien qui touche à la santé d'une personne. Sortir du mode borne est sans conséquence :
au pire, quelqu'un ferme l'application devant vous.

---

## Deux autres usages possibles, à décider

### 1. La carte de retrait — celle que je recommande

Le client paie, repart avec une carte portant son numéro de commande. Quand ses lunettes sont
prêtes, il revient, passe la carte, et la borne affiche **« Vos lunettes sont prêtes, casier 4 »**
ou **« Encore deux jours »**.

Pourquoi c'est le bon usage : la borne devient utile **entre** la commande et la livraison, c'est-à-dire
pendant les trois à cinq jours où elle ne sert à rien aujourd'hui. Et un client qui revient en
boutique sans avoir à chercher son reçu, c'est une file d'attente en moins au comptoir.

Ce qu'il faut décider avant : **ce qu'on affiche**. Mon conseil — le prénom, l'état de la commande,
et rien d'autre. Ni l'ordonnance, ni les mesures, ni le montant. Une carte perdue ne doit pas
devenir un dossier médical ouvert sur un écran de boutique.

Ce qu'il reste à faire : associer la carte à la commande au moment du paiement (la borne lit la
carte, l'envoie avec le dossier), et une route sur le serveur pour la retrouver. Une journée.

### 2. Retrouver un client qui revient

Le client passe sa carte au début, et son nom et son téléphone sont déjà remplis. Gain réel pour
une personne âgée qui tape lentement.

Même prudence : la carte ne doit pré-remplir que ce que le client voit déjà à l'écran, et jamais
afficher une ordonnance. Et il faut une carte par client — à fabriquer, à distribuer, à remplacer
quand elle est perdue. C'est un coût de boutique, pas un coût de logiciel.

---

## Savoir quel lecteur vous avez — deux minutes

Presque tous les lecteurs de borne se présentent comme un **clavier** : ils « tapent » le numéro de
la carte puis Entrée. C'est celui-là que la borne sait lire, sans pilote et sans réglage.

Pour vérifier, deux façons :

1. **Sur la borne**, lancez l'application avec `--diag` et passez une carte. Le badge affiche
   `carte 0008234567 inconnue` : c'est gagné, le lecteur est en mode clavier.
2. **Plus en détail**, ouvrez `outils/rfid-test.html` dans un navigateur (copiez le dossier `outils`
   et `rfid.js` en gardant la structure). La page montre exactement ce que le lecteur envoie :
   le numéro, le nombre de caractères, le temps mis. C'est elle qui répond quand ça ne marche pas.

**Si rien ne s'affiche du tout**, le lecteur parle par port série (COM) ou par PC/SC, et la borne ne
sait pas encore le lire. Envoyez-moi la marque et le modèle : c'est un autre morceau de code, de
l'ordre d'une demi-journée, pas un obstacle.

---

## Comment la borne distingue une carte d'un client qui tape

Puisque le lecteur se fait passer pour un clavier, il a fallu les séparer. Le critère est la
**vitesse** : un lecteur envoie huit à douze caractères en moins d'un dixième de seconde, à
intervalle régulier. Aucune main ne fait cela. La borne exige donc des caractères séparés de moins
de 60 ms, terminés par Entrée, le tout en moins d'une demi-seconde — et elle n'écoute pas du tout
pendant que le client remplit un champ, sinon elle lui mangerait sa saisie.

Le banc `node outils/rfid-banc.js` vérifie les deux côtés : une carte doit passer, une frappe
humaine ne doit jamais passer, y compris quand quelqu'un tape vite, se corrige, ou s'interrompt au
milieu. Il tourne au CI.
