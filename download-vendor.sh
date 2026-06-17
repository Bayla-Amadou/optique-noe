#!/bin/bash
# ============================================================
# N.O.A — Script de téléchargement pour mode HORS-LIGNE
# À exécuter UNE FOIS sur le PC kiosque (nécessite internet)
#
# Usage:
#   chmod +x download-vendor.sh
#   ./download-vendor.sh
#
# Après exécution, modifiez index.html comme indiqué ci-dessous,
# puis lancez un serveur local: python3 -m http.server 8080
# et ouvrez Chrome sur: http://localhost:8080
# ============================================================

set -e

echo "=== Création du dossier vendor/ ==="
mkdir -p vendor/jsm/loaders vendor/jsm/environments

echo ""
echo "=== Three.js r150 (moteur 3D) ==="
curl -L "https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js" \
  -o vendor/three.module.js
echo "✓ vendor/three.module.js"

curl -L "https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/GLTFLoader.js" \
  -o vendor/jsm/loaders/GLTFLoader.js
echo "✓ vendor/jsm/loaders/GLTFLoader.js"

curl -L "https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/environments/RoomEnvironment.js" \
  -o vendor/jsm/environments/RoomEnvironment.js
echo "✓ vendor/jsm/environments/RoomEnvironment.js"

echo ""
echo "=== Jeeliz FaceFilter (détection faciale) ==="
curl -L "https://cdn.jsdelivr.net/gh/jeeliz/jeelizFaceFilter@master/dist/jeelizFaceFilterFlex.js" \
  -o vendor/jeelizFaceFilterFlex.js
echo "✓ vendor/jeelizFaceFilterFlex.js"

curl -L "https://cdn.jsdelivr.net/gh/jeeliz/jeelizFaceFilter@master/dist/NNC.json" \
  -o vendor/NNC.json
echo "✓ vendor/NNC.json"

echo ""
echo "=== Téléchargements terminés ! ==="
echo ""
echo "---------------------------------------------"
echo "ÉTAPES SUIVANTES pour activer le mode hors-ligne :"
echo ""
echo "1) Dans index.html, changez :"
echo "   Ligne Jeeliz script :"
echo "     src=\"vendor/jeelizFaceFilterFlex.js\""
echo ""
echo "2) Dans le bloc <script type=\"importmap\"> :"
echo "     \"three\": \"./vendor/three.module.js\","
echo "     \"three/addons/\": \"./vendor/jsm/\""
echo ""
echo "3) Lancez : python3 -m http.server 8080"
echo "4) Ouvrez Chrome : http://localhost:8080"
echo "---------------------------------------------"
