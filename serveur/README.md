# Serveur de dossiers N.O.A — installation sur Hetzner

Il reçoit les dossiers des bornes, les garde le temps de fabriquer les verres
et de livrer, puis **efface les photos**.

## Le cycle de vie

```
reçu ──> en fabrication ──> prêt ──> livré ──> (photos effacées)
```

La durée de conservation n'est pas une note dans un document : c'est du code
qui tourne quatre fois par jour. Une règle appliquée à la main n'est
appliquée que les premiers mois, et personne ne s'aperçoit qu'elle a cessé
de l'être.

Ce qui est effacé : **l'ordonnance et le portrait**. Ce qui reste : le nom,
la monture, le montant, les mesures. Il faut pouvoir répondre à un client
qui revient et tenir une comptabilité — mais son visage et son ordonnance
n'ont plus aucune raison d'être là.

Le délai par défaut est de **30 jours après la livraison**. Il couvre un
retour ou une reprise immédiate. La garantie étant d'un an, vous pouvez
vouloir garder l'ordonnance plus longtemps pour refaire un verre cassé :
c'est une décision d'entreprise, elle se règle par `NOA_PURGE_JOURS`, et
elle doit être prise sciemment plutôt que subie.

## Installation

```bash
sudo apt update && sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx
sudo useradd -r -m -d /opt/noa noa
sudo -u noa git clone https://github.com/Bayla-Amadou/optique-noe.git /opt/noa/src
cd /opt/noa/src/serveur && sudo -u noa npm install --omit=dev
```

### Les secrets

```bash
sudo mkdir -p /etc/noa && sudo chmod 700 /etc/noa
printf 'NOA_CLE_BORNE=%s\nNOA_ADMIN_UTILISATEUR=%s\nNOA_ADMIN_MDP=%s\nNOA_DONNEES=/opt/noa/donnees\nNOA_PORT=8080\nNOA_PURGE_JOURS=30\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -base64 18)" | sudo tee /etc/noa/env >/dev/null
sudo chmod 600 /etc/noa/env
sudo cat /etc/noa/env      # notez la clé : elle va dans serveur.config.json de la borne
```

Le serveur **refuse de démarrer** sans ces deux secrets. Sans eux il
accepterait n'importe qui, et un serveur qui démarre à moitié configuré est
plus dangereux qu'un serveur éteint.

### Le service

```bash
sudo tee /etc/systemd/system/noa.service >/dev/null <<'UNIT'
[Unit]
Description=N.O.A — serveur de dossiers
After=network.target

[Service]
Type=simple
User=noa
WorkingDirectory=/opt/noa/src/serveur
EnvironmentFile=/etc/noa/env
ExecStart=/usr/bin/node serveur.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/noa/donnees

[Install]
WantedBy=multi-user.target
UNIT
sudo mkdir -p /opt/noa/donnees && sudo chown noa:noa /opt/noa/donnees
sudo systemctl enable --now noa && sudo systemctl status noa
```

### HTTPS

Obligatoire, et pas seulement par principe : la borne envoie des
ordonnances et des photos de clients. En clair sur le réseau, n'importe
quel intermédiaire les lit.

```bash
sudo tee /etc/nginx/sites-available/noa >/dev/null <<'NGINX'
server {
  server_name noa.example.sn;
  client_max_body_size 30M;      # les photos passent par là
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/noa /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d noa.example.sn
```

`client_max_body_size` est à régler : la valeur par défaut de nginx est
1 Mo, et un dossier avec deux photos la dépasse. Sans ça, les bornes
recevraient une erreur 413 et réessaieraient indéfiniment.

### Chiffrement du disque

Il se fait au niveau du serveur, pas de l'application. Sur Hetzner, un
volume chiffré (LUKS) protège aussi les **sauvegardes** et les **journaux**,
ce qu'un chiffrement applicatif ne ferait pas. À demander au moment de
commander le serveur : rétro-chiffrer un disque en service est pénible.

## Relier une borne

Dans `serveur.config.json` de la borne :

```json
{
  "url":      "https://noa.example.sn",
  "cle":      "la valeur de NOA_CLE_BORNE",
  "boutique": "dakar-plateau"
}
```

## L'atelier

`https://noa.example.sn` — nom d'utilisateur et mot de passe du compte (voir « Comptes » plus bas).

La liste des dossiers, l'ordonnance et le portrait consultables, et un
bouton pour faire avancer chaque commande. Les images ne voyagent jamais
dans la liste et ne sont pas accessibles par une simple adresse : il faut
une session. Une photo d'ordonnance ne doit pas être partageable d'un
copier-coller de lien.

## Vérifier

```bash
cd /opt/noa/src/serveur && node banc.js
```

Le banc éprouve la clé, le dépôt, le renvoi d'un même dossier, le cycle de
vie, et surtout la purge : que les photos partent après la livraison, et
**seulement** après.

## Sauvegardes

```bash
sudo tee /etc/cron.daily/noa-sauvegarde >/dev/null <<'CRON'
#!/bin/sh
d=/opt/noa/sauvegardes; mkdir -p $d
sqlite3 /opt/noa/donnees/noa.db ".backup $d/noa-$(date +%F).db"
find $d -name 'noa-*.db' -mtime +30 -delete
CRON
sudo chmod +x /etc/cron.daily/noa-sauvegarde
```

La base est sauvegardée, **pas les photos**. C'est volontaire : sauvegarder
les photos ferait survivre des ordonnances à leur propre effacement, et la
purge deviendrait une façade. Une photo perdue se reprend ; une photo qui
traîne dix ans dans une sauvegarde, non.

## La flotte : signes de vie, mesures, ordres

Le serveur reçoit aussi les signes de vie des bornes et leurs mesures anonymes,
et leur donne des ordres. Tout passe par la même clé partagée (`NOA_CLE_BORNE`)
côté borne et un compte (nom d'utilisateur + mot de passe) côté atelier.

| Appel | Qui | Rôle |
|---|---|---|
| `POST /bornes/signe` | borne | « je suis là » + état ; la réponse porte les ordres en attente |
| `POST /bornes/accuse` | borne | accusé d'exécution d'un ordre |
| `POST /mesures` | borne | lot de mesures anonymes (validées à nouveau ici, dédoublonnées) |
| `GET /api/flotte` | atelier | bornes, statut, alertes |
| `GET /api/mesures/stats` | atelier | distributions, essayages dégradés par heure |
| `POST /api/commande` | atelier | un ordre : `redemarrer`, `recharger`, `collecte_on`, `collecte_off` |

Une commande est un mot d'une **liste fermée**, jamais du code. Elle périme au
bout d'une heure si la borne ne l'a pas prise.

### Tableau de bord hébergé ailleurs (GitHub Pages)

Le navigateur n'accepte d'interroger ce serveur depuis un autre site que si
celui-ci est listé :

```bash
NOA_ORIGINES=https://bayla-amadou.github.io
```

(plusieurs origines : séparées par des virgules). Le serveur **doit être en
HTTPS** : une page HTTPS ne peut pas appeler un serveur HTTP. Sans cette
variable, aucun site étranger ne peut lire la flotte. `banc.js` vérifie ce
comportement.

## Le pilotage (opticiens et administration)

Le tableau de bord est servi par ce serveur sous `/tableau-de-bord/` (la racine y
renvoie). Appels ajoutés, tous derrière la session de l'atelier :

| Appel | Rôle |
|---|---|
| `GET /api/dossiers?q=&etat=&boutique=&du=&au=&limite=&decalage=` | recherche paginée |
| `GET /api/dossiers/:id` | dossier + historique + notes |
| `POST /api/dossiers/:id/note` | note d'un opticien |
| `GET /api/dossiers.csv` | export, cellules protégées contre les formules de tableur |
| `GET /api/ventes/stats?jours=&boutique=&borne=` | chiffre d'affaires, panier, conversion, délais, retards |
| `GET/POST /api/reglages` | réglages poussés aux bornes (global ou par borne) |
| `GET /api/audit` | journal des actions |

La mise en service sur Hetzner (Docker, HTTPS automatique, sauvegardes) est décrite dans
`deploiement/HERMES.md`. `node banc.js`, `node banc-pilotage.js` et `node banc-sauvegarde.js`
vérifient respectivement le cœur, le pilotage et les sauvegardes.


## Comptes du tableau de bord

Nom d'utilisateur + mot de passe, deux rôles. Les comptes vivent dans les **secrets du serveur** (`.env`), jamais dans Git.

| Rôle | Voit |
|---|---|
| `admin` | tout : ventes, bornes, réglages, mesures, journal, dossiers |
| `opticien` | dossiers des patients, commandes ; limité à **une boutique** si le compte en porte une |

- **Démarrer vite** : `NOA_ADMIN_UTILISATEUR` + `NOA_ADMIN_MDP` (12 caractères au moins) = un administrateur.
- **Recommandé** : `NOA_COMPTES=bayla:admin:<empreinte>;fred:opticien:<empreinte>:dakar-plateau`. L'empreinte se fabrique avec
  `NOA_NOUVEAU_MDP='…' node serveur/outils/creer-compte.js fred opticien dakar-plateau` ; le mot de passe n'est écrit nulle part.
- Le serveur **refuse de démarrer** sans clé de borne ni compte.
- 5 échecs de suite (même utilisateur ou même adresse) = verrouillage de 15 minutes. Sessions de 12 h, en mémoire (un redémarrage déconnecte tout le monde).
- Le journal des actions porte le nom du compte. Banc : `node banc-comptes.js`.
