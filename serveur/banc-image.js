/**
 * Banc de l'image Docker : tout ce que le serveur exige à l'exécution doit se trouver DANS l'image.
 *
 * Ce banc existe parce que le défaut s'est produit : `sms.js` a été ajouté au serveur et oublié dans
 * le Dockerfile, qui énumérait ses fichiers un par un. Rien ne le signalait — ni au démarrage local,
 * où le fichier est là, ni à la construction de l'image, qui réussit. Le conteneur mourait seulement
 * au lancement en production, sur un « Cannot find module ».
 *
 * Lancer : node serveur/banc-image.js
 */
const fs = require('fs'), path = require('path');
const ICI = __dirname;
const dockerfile = fs.readFileSync(path.join(ICI, 'Dockerfile'), 'utf8');
const ec = [], ok = (c, m) => { if (!c) ec.push(m); };

/** Les fichiers de serveur/ que l'image embarque, d'après ses lignes COPY et RUN rm. */
function dansImage() {
  const tous = new Set();
  for (const l of dockerfile.split('\n')) {
    const m = l.match(/^COPY\s+(.+?)\s+\.\/?$/);
    if (!m) continue;
    for (const motif of m[1].trim().split(/\s+/)) {
      const mm = motif.match(/^serveur\/(.+)$/); if (!mm) continue;
      const nom = mm[1];
      if (nom.includes('*')) {
        const re = new RegExp('^' + nom.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$');
        for (const f of fs.readdirSync(ICI)) if (re.test(f)) tous.add(f);
      } else tous.add(nom);
    }
  }
  for (const l of dockerfile.split('\n')) {
    const m = l.match(/^RUN\s+rm\s+-f\s+(.+)$/);
    if (!m) continue;
    for (const motif of m[1].trim().split(/\s+/)) {
      const nom = motif.replace(/^\.\//, '');
      const re = new RegExp('^' + nom.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$');
      for (const f of [...tous]) if (re.test(f)) tous.delete(f);
    }
  }
  return tous;
}

/** Ce que `depart` exige, de proche en proche, parmi les fichiers du dossier. */
function exigences(depart) {
  const vus = new Set(), aVoir = [depart];
  while (aVoir.length) {
    const f = aVoir.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const src = fs.readFileSync(path.join(ICI, f), 'utf8');
    for (const m of src.matchAll(/require\(\s*['"]\.\/([A-Za-z0-9_.-]+?)(\.js)?['"]\s*\)/g)) {
      const nom = m[1] + '.js';
      if (fs.existsSync(path.join(ICI, nom))) aVoir.push(nom);
      else ec.push(`${f} exige ./${m[1]}, qui n'existe pas dans serveur/`);
    }
  }
  return vus;
}

const image = dansImage(), requis = exigences('serveur.js');
for (const f of requis)
  ok(image.has(f), `${f} est exigé au démarrage mais n'est PAS copié dans l'image : le conteneur mourra sur « Cannot find module »`);
// Un banc d'essai n'a rien à faire dans une image de production.
for (const f of image) ok(!/^banc/.test(f), `${f} est un banc d'essai : il ne doit pas partir en production`);
ok(image.has('serveur.js'), 'serveur.js doit être dans l\'image');
ok(requis.size >= 3, 'la liste des modules exigés paraît trop courte : le banc ne lit sans doute plus rien');

if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log(`IMAGE OK : les ${requis.size} modules exigés au démarrage (${[...requis].sort().join(', ')}) ` +
            `sont tous dans l'image, et aucun banc d'essai n'y est.`);
