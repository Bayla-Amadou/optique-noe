#!/usr/bin/env bash
# Sauvegarde quotidienne : à lancer par cron (voir HERMES.md).
#   0 3 * * *  /opt/noa/serveur/deploiement/sauvegarde.sh >> /var/log/noa-sauvegarde.log 2>&1
#
# 1. fait une copie cohérente de la base et une archive des photos (dans le volume) ;
# 2. si NOA_SAUVEGARDE_DISTANT est défini, envoie le tout hors de la machine
#    (ex. boîte de stockage Hetzner :  u123456@u123456.your-storagebox.de:noa/).
#    Une sauvegarde sur le même disque que les données ne protège pas d'un disque mort.
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T noa node sauvegarde.js
if [ -n "${NOA_SAUVEGARDE_DISTANT:-}" ]; then
  VOL=$(docker volume inspect -f '{{ .Mountpoint }}' "$(docker compose config --format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')_donnees")
  rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new" "$VOL/sauvegardes/" "$NOA_SAUVEGARDE_DISTANT"
  echo "[Sauvegarde] envoyée vers $NOA_SAUVEGARDE_DISTANT"
fi
