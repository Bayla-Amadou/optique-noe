#!/bin/bash
# ============================================================
# N.O.A — Installation hors-ligne (kiosque)
# Usage: bash download-vendor.sh
# Télécharge tout, patche index.html, démarre le serveur.
# ============================================================

set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   N.O.A — Installation hors-ligne        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Téléchargement ───────────────────────────────────────
echo -e "${YELLOW}[1/3] Téléchargement des fichiers…${NC}"
mkdir -p vendor/jsm/loaders vendor/jsm/environments

curl -# -L "https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js" \
  -o vendor/three.module.js
echo -e "${GREEN}  ✓ Three.js${NC}"

curl -# -L "https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/GLTFLoader.js" \
  -o vendor/jsm/loaders/GLTFLoader.js
echo -e "${GREEN}  ✓ GLTFLoader${NC}"

curl -# -L "https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/environments/RoomEnvironment.js" \
  -o vendor/jsm/environments/RoomEnvironment.js
echo -e "${GREEN}  ✓ RoomEnvironment${NC}"

curl -# -L "https://cdn.jsdelivr.net/gh/jeeliz/jeelizFaceFilter@master/dist/jeelizFaceFilterFlex.js" \
  -o vendor/jeelizFaceFilterFlex.js
echo -e "${GREEN}  ✓ Jeeliz FaceFilter${NC}"

curl -# -L "https://cdn.jsdelivr.net/gh/jeeliz/jeelizFaceFilter@master/dist/NNC.json" \
  -o vendor/NNC.json
echo -e "${GREEN}  ✓ NNC.json (réseau neuronal)${NC}"

# ── 2. Patch index.html pour utiliser vendor/ ───────────────
echo ""
echo -e "${YELLOW}[2/3] Configuration mode hors-ligne…${NC}"

# Sauvegarde l'original si pas déjà fait
if [ ! -f index.html.cdn-backup ]; then
  cp index.html index.html.cdn-backup
  echo "  → Sauvegarde : index.html.cdn-backup"
fi

# Patch 1 : script Jeeliz → local
sed -i 's|src="https://cdn.jsdelivr.net/gh/jeeliz/jeelizFaceFilter@master/dist/jeelizFaceFilterFlex.js"|src="vendor/jeelizFaceFilterFlex.js"|g' index.html

# Patch 2 : importmap Three.js → local
sed -i 's|"https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js"|"./vendor/three.module.js"|g' index.html
sed -i 's|"https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/"|"./vendor/jsm/"|g' index.html

echo -e "${GREEN}  ✓ index.html configuré pour hors-ligne${NC}"

# ── 3. Démarrage du serveur ──────────────────────────────────
echo ""
echo -e "${YELLOW}[3/3] Démarrage du serveur…${NC}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Ouvrez Chrome sur :                     ║${NC}"
echo -e "${GREEN}║  http://localhost:8080                   ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Ctrl+C pour arrêter le serveur          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

python3 -m http.server 8080
