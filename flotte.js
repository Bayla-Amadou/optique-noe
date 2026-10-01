/**
 * N.O.A — La borne dans sa flotte
 *
 * Trois choses, toutes tolérantes à la perte du réseau :
 *   1. un SIGNE DE VIE chaque minute : « je suis là, voici mon état ». Le
 *      serveur en déduit quelle borne est muette ;
 *   2. l'ENVOI DES MESURES anonymes (mode collecte), par lots, avec un
 *      repère qui n'avance que si le serveur a répondu : rien n'est perdu,
 *      rien n'est envoyé deux fois ;
 *   3. les COMMANDES reçues avec la réponse au signe de vie. Une liste
 *      fermée : redémarrer, recharger la page, activer ou couper la
 *      collecte. La borne revérifie : un mot hors liste est ignoré, même
 *      s'il venait du serveur.
 *
 * Sans réseau, rien de tout cela ne bloque : on réessaie à la minute suivante.
 * Sans serveur configuré, ce module ne fait rien.
 */
const fs = require('fs');
const path = require('path');

const ACTIONS = ['redemarrer', 'recharger', 'collecte_on', 'collecte_off'];
const SIGNE_MS = 60 * 1000;
const MESURES_MS = 5 * 60 * 1000;
const LOT = 500;

function demarrer(ctx) {
  // ctx : { app, requete, config, borne, etatPage, dossierEtat, appliquer, dossierDonnees }
  const { app, requete, config, borne, etatPage, dossierEtat, appliquer, dossierDonnees } = ctx;
  if (!borne || !borne.borne) return;               // pas une borne identifiée : rien à signaler
  const fichierOffset = path.join(dossierDonnees, 'mesures.offset');
  const fichierMesures = path.join(dossierDonnees, 'mesures.ndjson');
  const faites = [];                                // identifiants de commandes déjà exécutées

  const url = (c, chemin) => c.url.replace(/\/$/, '') + chemin;
  const entetes = c => ({ 'Content-Type': 'application/json', 'X-NOA-Cle': c.cle });

  async function signe() {
    const c = config();
    if (!c) return;
    const page = etatPage() || {};
    let file = {}, mem = null;
    try { file = dossierEtat() || {}; } catch (_) {}
    try { mem = app.getAppMetrics().reduce((a, m) => a + (m.memory.workingSetSize || 0), 0) / 1024; } catch (_) {}
    const r = await requete(url(c, '/bornes/signe'), { method: 'POST', headers: entetes(c) }, {
      borne: borne.borne, boutique: c.boutique || null, build: ctx.build || null,
      uptime_s: Math.round(process.uptime()), memoire_mo: mem == null ? undefined : Math.round(mem),
      camera: page.camera, cameras: page.cameras, images: page.images, gl_restaures: page.gl,
      session: !!page.session, collecte: !!ctx.collecteActive(),
      maj: ctx.maj ? ctx.maj().etat : undefined, maj_version: ctx.maj ? ctx.maj().version : undefined,
      file_attente: file.en_attente, dossiers_refuses: file.refuse, electron: process.versions.electron,
    });
    if (!r.ok || !r.corps || !Array.isArray(r.corps.commandes)) return;
    for (const cmd of r.corps.commandes) await executer(c, cmd);
  }

  async function executer(c, cmd) {
    if (!cmd || !Number.isInteger(cmd.id) || faites.includes(cmd.id)) return;
    faites.push(cmd.id); if (faites.length > 50) faites.shift();
    let resultat = 'ignoree';
    if (ACTIONS.includes(cmd.action)) {
      try { resultat = (await appliquer(cmd.action)) || 'ok'; } catch (e) { resultat = 'echec: ' + e.message; }
    }
    // L'accusé part AVANT un redémarrage : sinon l'atelier ne saurait jamais si l'ordre est passé.
    await requete(url(c, '/bornes/accuse'), { method: 'POST', headers: entetes(c) },
                  { id: cmd.id, ok: !/^echec|^ignoree/.test(resultat), resultat });
    if (cmd.action === 'redemarrer') setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
  }

  async function mesures() {
    const c = config();
    if (!c || !fs.existsSync(fichierMesures)) return;
    let off = 0;
    try { off = JSON.parse(fs.readFileSync(fichierOffset, 'utf8')).octets || 0; } catch (_) {}
    const taille = fs.statSync(fichierMesures).size;
    if (taille < off) off = 0;                       // le fichier a été remplacé (limite de taille)
    if (taille === off) return;
    const fd = fs.openSync(fichierMesures, 'r');
    const buf = Buffer.alloc(Math.min(taille - off, 512 * 1024));
    fs.readSync(fd, buf, 0, buf.length, off); fs.closeSync(fd);
    const texte = buf.toString('utf8');
    const finLigne = texte.lastIndexOf('\n');
    if (finLigne < 0) return;                         // ligne incomplète : on attend
    const lignes = []; let consomme = 0;
    for (const l of texte.slice(0, finLigne + 1).split('\n')) {
      if (lignes.length >= LOT) break;
      consomme += Buffer.byteLength(l) + 1;
      if (l.trim()) try { lignes.push(JSON.parse(l)); } catch (_) {}
    }
    if (!lignes.length) { fs.writeFileSync(fichierOffset, JSON.stringify({ octets: off + consomme })); return; }
    const r = await requete(url(c, '/mesures'), { method: 'POST', headers: entetes(c) }, { lignes });
    // Le repère n'avance que si le serveur a répondu : un réseau coupé n'efface rien.
    if (r.ok) fs.writeFileSync(fichierOffset, JSON.stringify({ octets: off + consomme }));
  }

  const garde = f => () => f().catch(e => console.error('[Flotte]', e.message));
  setTimeout(garde(signe), 10 * 1000);
  setInterval(garde(signe), SIGNE_MS);
  setTimeout(garde(mesures), 30 * 1000);
  setInterval(garde(mesures), MESURES_MS);
  console.log(`[Flotte] ${borne.borne} : signe de vie chaque minute, mesures toutes les 5 minutes`);
}

module.exports = { demarrer, ACTIONS };
