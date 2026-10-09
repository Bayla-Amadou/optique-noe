# Serveur N.O.A : une image petite, qui tourne sans droits particuliers.
# Construit depuis la RACINE du dépôt (voir deploiement/docker-compose.yml) :
# l'image embarque aussi le tableau de bord, servi par le serveur lui-même.
# La chaîne de compilation reste uniquement dans l'étape de construction.
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS dependances
WORKDIR /app
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY serveur/package.json serveur/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# L'image d'exécution ne contient ni compilateur, ni Python, ni en-têtes système.
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
WORKDIR /app
COPY --from=dependances --chown=node:node /app/node_modules ./node_modules
COPY serveur/package.json ./
COPY serveur/serveur.js serveur/pilotage.js serveur/comptes.js serveur/reglages.js serveur/mesures.js serveur/sauvegarde.js ./
COPY serveur/outils ./outils
# Tableau de bord et logo : /tableau-de-bord/ et /assets/marque/, même origine que l'API.
COPY tableau-de-bord ./public/tableau-de-bord
COPY assets/marque ./public/assets/marque
ENV NODE_ENV=production NOA_DONNEES=/donnees NOA_PORT=8080
# Le dossier de données est un volume : l'image se remplace, les dossiers restent.
RUN mkdir -p /donnees && chown -R node:node /donnees /app
VOLUME /donnees
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "serveur.js"]
