/**
 * Banc du lecteur RFID : une carte doit être reconnue, une main ne doit jamais l'être.
 * C'est tout l'enjeu — si la frappe d'un client passait pour une carte, la borne se déverrouillerait
 * toute seule au milieu d'une commande.
 * Lancer : node outils/rfid-banc.js
 */
const R = require('../rfid.js');
const ec = [], ok = (c, m) => { if (!c) ec.push(m); };

/** Rejoue une frappe : `texte` tapé à `pas` ms d'intervalle (± `gigue`), puis la touche de fin. */
function frapper(texte, pas, { fin = 'Enter', gigue = 0, depart = 1000 } = {}) {
  const lect = R.creer();
  let t = depart, sortie = null;
  for (const ch of texte) {
    sortie = lect.touche(ch, t) || sortie;
    t += pas + (gigue ? ((t * 7919) % (2 * gigue)) - gigue : 0);
  }
  if (fin) sortie = lect.touche(fin, t) || sortie;
  return sortie;
}

/* ── Une carte est reconnue ─────────────────────────────────────────── */
const carte = frapper('0008234567', 8);
ok(carte && carte.uid === '0008234567', 'un badge décimal de 10 chiffres doit être lu : ' + JSON.stringify(carte));
ok(!!frapper('A1B2C3D4', 6), 'un badge hexadécimal doit être lu');
ok(!!frapper('123456', 5), 'six caractères suffisent');
ok(!!frapper('0008234567', 8, { fin: 'Tab' }), 'certains lecteurs terminent par Tab');
ok(!!frapper('0008234567', 8, { gigue: 3 }), 'une petite irrégularité du lecteur reste acceptée');
ok(!!frapper('0008234567', 45), 'un lecteur lent (45 ms par caractère) doit passer');

/* ── Une main n'est jamais prise pour une carte ──────────────────────── */
ok(!frapper('0008234567', 120), 'une frappe humaine rapide (120 ms par touche) ne doit PAS passer');
ok(!frapper('77123456', 200), 'un numéro de téléphone tapé à la main ne doit PAS passer');
ok(!frapper('Amadou', 110), 'un prénom tapé à la main, même vite, ne doit pas passer');
ok(!frapper('12345', 8), 'cinq caractères : trop court pour un identifiant de carte');
ok(!frapper('0008234567', 8, { fin: null }), 'sans touche de fin, rien n\'est validé');

// Un trou au milieu casse la lecture, même si tout le reste est rapide.
{
  const lect = R.creer(); let t = 0, out = null;
  for (const ch of '00082') { out = lect.touche(ch, t) || out; t += 8; }
  t += 400;                                             // le client s'interrompt
  for (const ch of '34567') { out = lect.touche(ch, t) || out; t += 8; }
  out = lect.touche('Enter', t) || out;
  ok(!out, 'une frappe interrompue en son milieu ne doit pas être lue comme une carte');
}
// Une touche qui n'appartient pas à l'alphabet d'un lecteur remet le compteur à zéro : ce qui
// précède la correction est oublié, ce qui suit repart d'une page blanche.
{
  const lect = R.creer(); let t = 0, out = null;
  for (const ch of '0008') { out = lect.touche(ch, t) || out; t += 110; }
  out = lect.touche('Backspace', t) || out; t += 110;
  for (const ch of '234567') { out = lect.touche(ch, t) || out; t += 110; }
  out = lect.touche('Enter', t) || out;
  ok(!out, 'quelqu\'un qui tape, se corrige et retape ne doit jamais passer pour une carte');
}
// Le seul moyen de tromper le module serait de taper six caractères en moins de 60 ms chacun,
// ce qu'aucune main ne fait. On le vérifie à la frontière plutôt que de le supposer.
ok(!frapper('123456', 70), 'à 70 ms par touche — déjà plus rapide qu\'un dactylographe — rien ne passe');
ok(!!frapper('123456', 50), 'à 50 ms, un lecteur lent passe encore');

/* ── Deux cartes de suite ───────────────────────────────────────────── */
{
  const lect = R.creer(); let t = 0; const lues = [];
  for (const uid of ['0008234567', '0009876543']) {
    for (const ch of uid) { const r = lect.touche(ch, t); if (r) lues.push(r.uid); t += 8; }
    const r = lect.touche('Enter', t); if (r) lues.push(r.uid); t += 900;
  }
  ok(lues.length === 2 && lues[1] === '0009876543', 'deux passages de carte de suite doivent donner deux lectures : ' + lues.join(', '));
}

/* ── Le champ de saisie ─────────────────────────────────────────────── */
const faux = el => ({ activeElement: el });
ok(R.saisieEnCours(faux({ tagName: 'INPUT' })), 'un champ de texte doit être reconnu');
ok(R.saisieEnCours(faux({ tagName: 'DIV', isContentEditable: true })), 'un bloc éditable aussi');
ok(!R.saisieEnCours(faux({ tagName: 'BODY' })), 'le corps de la page n\'est pas une saisie');
ok(!R.saisieEnCours(null) && !R.saisieEnCours({}), 'pas de document, pas de saisie');

/* ── Le temps mesuré est rendu, pour le diagnostic ──────────────────── */
ok(carte && carte.ms > 0 && carte.ms < 200 && carte.taille === 10,
   'la lecture doit rendre sa durée et sa taille : ' + JSON.stringify(carte));

if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log('RFID OK : carte décimale et hexadécimale lues (Entrée ou Tab), frappe humaine, ' +
            'frappe interrompue, correction au clavier et saisie en cours toutes refusées');
