# Mise en service du serveur N.O.A sur Hetzner — consignes pour Hermès

Ce document est écrit pour un agent (ou un administrateur) qui a un accès SSH à
la machine Hetzner. Il dit quoi faire, dans quel ordre, comment **vérifier**
chaque étape, et ce qu'il ne faut **pas** faire. Le serveur est le cœur de
N.O.A : il garde les dossiers des patients (nom, téléphone, ordonnance scannée,
portrait), reçoit les signes de vie des bornes, pousse leurs réglages, et sert
le tableau de bord. Les données sont des données de santé : traiter chaque étape
comme si c'était le cas.

> L'auteur de ces fichiers n'a **pas** pu construire l'image Docker ni lancer
> la pile dans son environnement (pas de démon Docker). Le fichier
> `docker-compose.yml` est validé (`docker compose config`), le code du serveur
> est testé, mais **la première construction se fait ici**. Si une étape
> échoue, ne pas improviser : lire l'erreur, corriger, et le noter dans le
> compte rendu.

## 0. Ce dont on a besoin avant de commencer

| | |
|---|---|
| Machine | Hetzner Cloud, **Ubuntu 24.04**, au moins 2 vCPU / 4 Go / 40 Go (type CX22 ou CPX21). Volume chiffré si possible. |
| Nom de domaine | un enregistrement **A** (et AAAA si IPv6) vers l'IP de la machine, par exemple `noa.<domaine>`. À créer **avant** le démarrage : sans lui, Caddy ne peut pas obtenir le certificat HTTPS. |
| Accès | clé SSH ; pas de mot de passe SSH. |
| Dépôt | `https://github.com/Bayla-Amadou/optique-noe` (public). |

## 1. Durcir la machine

```bash
apt update && apt -y upgrade
apt -y install ufw fail2ban unattended-upgrades rsync git
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
# SSH : clés seulement, pas de connexion root par mot de passe
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh
dpkg-reconfigure -f noninteractive unattended-upgrades
```

**Vérifier** : `ufw status` n'ouvre que 22, 80, 443 ; `systemctl status fail2ban` actif.
**Ne pas** ouvrir le port 8080 : le serveur N.O.A n'est joignable que par Caddy.

## 2. Installer Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 3. Récupérer le code

```bash
mkdir -p /opt/noa && cd /opt/noa
git clone https://github.com/Bayla-Amadou/optique-noe.git .
cd serveur/deploiement
```

## 4. Créer les secrets (jamais dans Git, jamais dans un message)

```bash
cp .env.exemple .env && chmod 600 .env
# générer, puis écrire dans .env :
echo "NOA_CLE_BORNE=$(openssl rand -base64 36 | tr -d '/+=\n')"
```

Éditer `.env` : renseigner `NOA_DOMAINE`, coller `NOA_CLE_BORNE`, et mettre le compte administrateur (`NOA_ADMIN_UTILISATEUR` et `NOA_ADMIN_MDP`, ou `NOA_COMPTES`, voir `.env.exemple`) — **ces valeurs sont fournies par la propriétaire, ne pas en inventer**, laisser
`NOA_ORIGINES=https://bayla-amadou.github.io` (le tableau de bord de démonstration
sur GitHub Pages ; le vrai tableau de bord est servi par le serveur lui-même).

**Vérifier** : `stat -c '%a' .env` affiche `600`. `git status` ne montre **pas** `.env`.

## 5. Démarrer

```bash
docker compose up -d --build
docker compose ps          # noa et caddy : "running" (noa : "healthy" après ~30 s)
docker compose logs -f --tail 50
```

**Vérifier**, depuis la machine puis depuis l'extérieur :

```bash
curl -fsS https://<NOA_DOMAINE>/sante                    # {"ok":true}
curl -sI https://<NOA_DOMAINE>/ | head -3                 # 302 vers /tableau-de-bord/
curl -s -o /dev/null -w '%{http_code}\n' https://<NOA_DOMAINE>/api/flotte   # 401 : refusé sans session
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<NOA_DOMAINE>/dossiers -H 'Content-Type: application/json' -d '{}'   # 401 : refusé sans clé
curl -sI http://<NOA_DOMAINE>/ | head -2                  # redirigé vers https
```

Les trois derniers résultats doivent être exactement **401, 401, redirection**.
S'ils sont autres, **arrêter** : quelque chose est ouvert qui ne devrait pas l'être.

## 6. Essai de bout en bout (avec des données factices)

```bash
CLE=$(grep ^NOA_CLE_BORNE .env | cut -d= -f2-)
curl -fsS -X POST https://<NOA_DOMAINE>/bornes/signe -H "X-NOA-Cle: $CLE" -H 'Content-Type: application/json' \
  -d '{"borne":"essai-1","boutique":"essai","build":"BK","camera":"inactive","cameras":1}'
```

Réponse attendue : `{"ok":true,"commandes":[],"reglages":{...}}`. Ouvrir
`https://<NOA_DOMAINE>/` dans un navigateur, se connecter avec le compte administrateur (nom d'utilisateur et mot de passe) :
la borne « essai-1 » doit apparaître, « En ligne ». Elle passera « Hors ligne » au bout de dix minutes sans signe de vie, ce qui est normal : c'est une borne d'essai. Cet essai ne crée **aucun dossier** dans la base.

## 7. Sauvegardes

```bash
chmod +x /opt/noa/serveur/deploiement/sauvegarde.sh
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/noa/serveur/deploiement/sauvegarde.sh >> /var/log/noa-sauvegarde.log 2>&1" ) | crontab -
/opt/noa/serveur/deploiement/sauvegarde.sh        # première sauvegarde, à la main
```

La sauvegarde est **relue** (comptage des dossiers, contrôle d'intégrité) ; la
dernière ligne doit dire `intégrité ok`. Elle reste 14 jours sur la machine.
**Ce n'est pas suffisant** : une sauvegarde sur le même disque ne protège pas
d'un disque perdu. Mettre en place une copie **hors de la machine** — par
exemple une *Storage Box* Hetzner : exporter `NOA_SAUVEGARDE_DISTANT=u123456@u123456.your-storagebox.de:noa/`
dans la crontab (clé SSH dédiée, en écriture seule si possible).

**Essai de restauration** (à faire une fois, sur une copie, pas sur la production) :
ouvrir une sauvegarde avec `sqlite3 noa-AAAA-MM-JJ-HH-MM.db 'select count(*) from dossiers'`
et vérifier que le nombre est cohérent. Une sauvegarde jamais restaurée n'est qu'une espérance.

## 8. Ce qu'il faut remettre à la propriétaire (par un canal sûr, pas par un chat ouvert)

1. L'adresse : `https://<NOA_DOMAINE>/`.
2. Rien à transmettre pour le tableau de bord : le compte (nom d'utilisateur, mot de passe) vient de la propriétaire et reste dans `.env`.
3. La clé des bornes (`NOA_CLE_BORNE`) — pour le fichier `serveur.config.json` de **chaque borne** :
   ```json
   { "url": "https://<NOA_DOMAINE>", "cle": "<NOA_CLE_BORNE>", "boutique": "nom-de-la-boutique" }
   ```
4. Un compte rendu : ce qui a été fait, ce qui a été vérifié, ce qui ne l'a **pas** été.

## 9. Mettre à jour le serveur plus tard

```bash
cd /opt/noa && git pull --ff-only
cd serveur/deploiement && docker compose up -d --build
docker compose ps && curl -fsS https://<NOA_DOMAINE>/sante
```

Le volume `donnees` n'est jamais touché par une reconstruction : dossiers, photos,
base et sauvegardes survivent. **Ne jamais** lancer `docker compose down -v` : l'option
`-v` supprime ce volume, donc tous les dossiers des patients.

## 10. À ne pas faire

- Ne pas mettre `.env`, une clé, un mot de passe ou un dossier de patient dans Git, dans un ticket ou dans un message.
- Ne pas ouvrir d'autre port que 22, 80 et 443.
- Ne pas exposer la base SQLite ni le dossier des photos autrement que par le serveur.
- Ne pas désactiver la purge des photos (`NOA_PURGE_JOURS`) : les photos sont effacées un délai après la livraison, c'est une promesse faite aux clients.
- Ne pas changer `NOA_CLE_BORNE` sans prévenir : toutes les bornes cesseront d'être acceptées jusqu'à ce que leur fichier `serveur.config.json` soit mis à jour.
- Ne pas supposer qu'un test passé sur la machine d'origine vaut pour celle-ci : relancer les vérifications de l'étape 5.

## 11. Surveillance (quand le reste fonctionne)

- Un contrôle externe de `https://<NOA_DOMAINE>/sante` toutes les minutes (UptimeRobot, Hetzner, ou un `cron` sur une autre machine) avec alerte par courriel ou message.
- `docker compose logs --since 1h noa | grep -i -E "erreur|error"` quand quelque chose semble faux.
- Espace disque : `df -h /var/lib/docker` ; alerte à 80 %.
- Le tableau de bord montre déjà quelle **borne** est muette ; il ne dit pas si le **serveur** lui-même est tombé, d'où le contrôle externe.
