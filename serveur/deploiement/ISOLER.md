# Déménager N.O.A sur sa propre machine

N.O.A tourne aujourd'hui sur une machine partagée avec un autre projet : son conteneur est posé sur
le réseau Docker de cette autre pile, et c'est le Caddy de cette pile qui termine le HTTPS. Ça
fonctionne, mais deux choses ne vont pas :

1. **Le montage réellement en production n'est pas dans Git.** Il tient dans un
   `docker-compose.vps.yml` local et dans une règle de routage à l'intérieur de l'autre pile. Si la
   machine est perdue, on a le code mais pas l'installation.
2. **Les données de santé partagent un réseau avec autre chose.** Tout conteneur de l'autre pile
   peut parler directement à `noa:8080`. L'API exige une clé ou une session, donc ce n'est pas une
   porte ouverte — mais ce n'est pas la règle qu'on veut tenir devant un patient.

Ce document décrit le déménagement, dans un ordre qui **ne perd aucun dossier** et qui laisse
l'ancienne machine intacte jusqu'à ce que la nouvelle soit prouvée.

> Vocabulaire : **ANCIENNE** = la machine partagée (`46.62.133.137`). **NOUVELLE** = la machine
> dédiée à créer. Chaque commande est annoncée par la machine sur laquelle elle se lance.

---

## 0. Ce qu'il faut avant de commencer

| | |
|---|---|
| Machine | Hetzner Cloud, **Ubuntu 24.04**, **CX22** (2 vCPU / 4 Go / 40 Go). Falkenstein ou Nuremberg : un peu plus proche de Dakar que Helsinki. |
| Clé SSH | celle du Mac (`hetzner_new`) à cocher **au moment de la création** — sinon pas d'accès. |
| Domaine | aucun achat : `<IP-avec-tirets>.sslip.io`, comme aujourd'hui. L'IP change, donc **le nom change**. |
| Durée | une heure, dont une courte fenêtre où le serveur est arrêté (étape 4). |

**À décider avant, une seule chose :** `NOA_CLE_BORNE` ne change **pas**. Les bornes garderont leur
clé ; seule l'URL de leur `serveur.config.json` est à modifier. Changer les deux en même temps rend
toute panne impossible à diagnostiquer.

---

## 1. NOUVELLE — préparer la machine

Suivre `HERMES.md` **étapes 1 à 3** telles quelles : durcir (ufw, fail2ban, SSH par clés), installer
Docker, cloner le dépôt dans `/opt/noa`.

**Vérifier** : `ufw status` n'ouvre que 22, 80, 443 ; `docker compose version` répond.

Puis se placer sur la branche en service :

```bash
cd /opt/noa && git checkout -B claude/trusting-pascal-TXK2N origin/claude/trusting-pascal-TXK2N
git log --oneline -1          # doit afficher le commit attendu
```

---

## 2. Reporter les secrets, sans les faire transiter par un chat

Le `.env` porte la clé des bornes et les mots de passe du tableau de bord. Le faire passer **d'un
serveur à l'autre sans jamais l'afficher** : depuis le Mac, en un seul tuyau. Rien ne s'écrit à
l'écran, rien n'atterrit dans un fichier local, rien ne passe par un presse-papiers.

```bash
# MAC
ssh root@<ANCIENNE> 'cat /opt/noa/serveur/deploiement/.env' \
  | ssh root@<NOUVELLE> 'cat > /opt/noa/serveur/deploiement/.env \
      && chmod 600 /opt/noa/serveur/deploiement/.env'
```

Puis, sur la **NOUVELLE**, appliquer les **deux seules** modifications — et vérifier le résultat,
qui n'affiche aucun secret :

```bash
# NOUVELLE
cd /opt/noa/serveur/deploiement
sed -i '/^COMPOSE_FILE=/d' .env
grep -q '^NOA_DOMAINE=' .env \
  && sed -i 's|^NOA_DOMAINE=.*|NOA_DOMAINE=<NOUVEAU-DOMAINE>|' .env \
  || echo 'NOA_DOMAINE=<NOUVEAU-DOMAINE>' >> .env
grep -E '^(NOA_DOMAINE|COMPOSE_FILE)=' .env ; stat -c '%a' .env ; grep -c . .env
```

Attendu : une seule ligne `NOA_DOMAINE=…`, **aucune** ligne `COMPOSE_FILE`, le mode `600`, et un
nombre de lignes identique à celui de l'ancien fichier (moins un si `COMPOSE_FILE` y était).

Tout le reste est repris **à l'identique** : `NOA_CLE_BORNE`, le compte administrateur,
`NOA_PURGE_JOURS`, les réglages SMS. **Deux différences, et seulement deux** :

- `NOA_DOMAINE` prend le nouveau nom : `<NOUVELLE-IP-avec-tirets>.sslip.io` ;
- **ne pas reprendre `COMPOSE_FILE`** s'il existe dans l'ancien. C'est lui qui écartait le service
  `caddy` ; sur la nouvelle machine on veut le `docker-compose.yml` du dépôt, Caddy compris.

**Vérifier** : `stat -c '%a' .env` affiche `600`, et `grep -c COMPOSE_FILE .env` affiche `0`.

---

## 3. NOUVELLE — démarrer à vide et prouver la machine

```bash
cd /opt/noa/serveur/deploiement && docker compose up -d --build && docker compose ps
```

Les **deux** services doivent être là : `noa` (healthy après ~30 s) et `caddy`. Si `caddy` ne démarre
pas, s'arrêter : c'est le point précis qu'on vient corriger.

Puis les contrôles de `HERMES.md` étape 5, depuis l'extérieur :

```bash
curl -fsS https://<NOUVEAU-DOMAINE>/sante                                   # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://<NOUVEAU-DOMAINE>/api/flotte              # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<NOUVEAU-DOMAINE>/dossiers \
     -H 'Content-Type: application/json' -d '{}'                            # 401
curl -sI http://<NOUVEAU-DOMAINE>/ | head -2                                # redirection vers https
```

**401, 401, redirection.** Autre chose : arrêter et comprendre avant d'aller plus loin.

Le certificat HTTPS est obtenu tout seul par Caddy, ce qui prouve au passage que la nouvelle machine
est bien jointe depuis Internet sur 80 et 443.

**À ce stade la nouvelle machine fonctionne, à vide, et l'ancienne sert toujours.** Rien n'est perdu
si on s'arrête ici.

---

## 4. La fenêtre d'arrêt : déplacer les données

C'est le seul moment où N.O.A est indisponible. Le faire à une heure creuse. **Aucune borne ne doit
déposer de dossier entre le `stop` et le basculement**, d'où l'arrêt plutôt qu'une copie à chaud :
une borne qui échoue réessaiera, une borne qui réussit sur l'ancienne machine après la copie verrait
son dossier perdu.

```bash
# ANCIENNE — une sauvegarde relue, qui imprime le nombre de dossiers. NOTER CE NOMBRE.
cd /opt/noa/serveur/deploiement && ./sauvegarde.sh
# ANCIENNE — arrêter le service, sans toucher au volume
docker compose stop noa
# ANCIENNE — archiver tout le volume
docker run --rm -v deploiement_donnees:/d:ro -v /root:/out alpine \
  tar czf /out/noa-donnees.tar.gz -C /d .
ls -lh /root/noa-donnees.tar.gz
```

**Pourquoi on archive le volume entier et pas le fichier `noa.db`.** La base tourne en mode WAL :
les écritures récentes vivent dans `noa.db-wal`, à côté, et n'ont pas encore rejoint `noa.db`. Il est
normal de voir un `noa.db` de quelques kilo-octets et un `noa.db-wal` bien plus gros — **c'est le
`-wal` qui porte les dossiers**. Copier le seul `noa.db` donnerait une base vide, sans le moindre
message d'erreur, et on ne s'en apercevrait que le jour où l'on chercherait un patient. Le `tar`
ci-dessus prend tout le volume : base, journal, photos, sauvegardes. C'est voulu.

Transférer par le Mac, qui a déjà une clé pour les deux machines :

```bash
# MAC
scp root@46-62-133-137.sslip.io:/root/noa-donnees.tar.gz ~/Downloads/
scp ~/Downloads/noa-donnees.tar.gz root@<NOUVEAU-DOMAINE>:/root/
```

Restaurer :

```bash
# NOUVELLE
cd /opt/noa/serveur/deploiement && docker compose stop noa
docker run --rm -v deploiement_donnees:/d -v /root:/in alpine \
  sh -c 'find /d -mindepth 1 -delete && tar xzf /in/noa-donnees.tar.gz -C /d && ls -la /d'
docker compose start noa && sleep 20 && docker compose ps
```

**Vérifier que les données sont bien arrivées** — c'est la vérification qui compte :

```bash
# NOUVELLE
docker compose exec -T noa node sauvegarde.js
```

La ligne imprimée doit annoncer **le même nombre de dossiers** qu'à l'étape précédente sur
l'ancienne machine, et `intégrité ok`. Si le nombre diffère, **ne pas continuer** : l'ancienne
machine a toujours ses données, on peut repartir de là.

Se connecter ensuite au tableau de bord sur la nouvelle adresse et regarder la liste des dossiers de
l'opticien : les noms doivent être là.

---

## 5. Basculer les bornes

Sur **chaque** borne, à côté de l'exécutable, modifier `serveur.config.json` :

```json
{ "url": "https://<NOUVEAU-DOMAINE>", "cle": "<NOA_CLE_BORNE, inchangée>", "boutique": "nom-de-la-boutique" }
```

Relancer l'application. **Vérifier** depuis le tableau de bord, page des bornes : chaque borne doit
repasser « En ligne » dans les minutes qui suivent. Une borne qui reste muette n'a pas été mise à
jour, ou son fichier contient une faute.

---

## 6. Retirer N.O.A de l'ancienne machine — pas avant

À faire **seulement** quand la nouvelle machine a servi pendant au moins quelques jours et que les
bornes y déposent.

```bash
# ANCIENNE
cd /opt/noa/serveur/deploiement && docker compose down
```

**Sans `-v`.** L'option `-v` supprimerait le volume `deploiement_donnees`, c'est-à-dire tous les
dossiers des patients. On garde ce volume en filet au moins deux semaines.

Retirer aussi la règle de routage ajoutée dans le Caddyfile de l'autre pile, sinon l'ancienne
adresse continuera de pointer vers un service arrêté.

Quand le filet n'est plus nécessaire :

```bash
# ANCIENNE
docker volume rm deploiement_donnees
docker image rm deploiement-noa          # l'image construite ici ne sert plus
rm -f /root/noa-donnees.tar.gz
```

Ce ménage compte : le disque de l'ancienne machine est rempli à 95 %. Les images N.O.A pèsent
plusieurs centaines de méga-octets, et une machine pleine finit par faire tomber ce qui tourne
dessus — N.O.A tant qu'il y est, et le reste ensuite.

Et sur le **Mac** : `rm ~/Downloads/noa-donnees.tar.gz` — cette archive contient la base des
patients et leurs photos d'ordonnance. Elle n'a rien à faire dans un dossier de téléchargements.

---

## 7. Ce qu'il reste à faire après le déménagement

- **Les sauvegardes** : `HERMES.md` étape 7, cron quotidien. Elles ne suivent pas toutes seules.
- **Une copie hors de la machine** (`NOA_SAUVEGARDE_DISTANT`). Une sauvegarde sur le disque qu'on
  protège ne protège de rien.
- **Un contrôle externe** de `/sante`, qui prévient quand le serveur tombe. Le tableau de bord dit
  quelle borne est muette ; il ne peut pas dire que le serveur lui-même est mort.

---

## À ne pas faire

- Ne pas supprimer quoi que ce soit sur l'ancienne machine avant le contrôle du nombre de dossiers.
- Ne jamais lancer `docker compose down -v`, ni d'un côté ni de l'autre.
- Ne pas changer `NOA_CLE_BORNE` pendant le déménagement : une seule variable à la fois.
- Ne pas laisser l'archive des données traîner sur le Mac ou dans `/root` une fois le travail fini.
- Ne pas reprendre `COMPOSE_FILE` de l'ancien `.env` : c'est la ligne qui écartait Caddy.
