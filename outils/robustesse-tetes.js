/**
 * Banc de robustesse : que fait le réglage des branches face aux têtes du
 * manifeste H05-H30 (variantes extrêmes de H01, « robustness only » : elles
 * servent à vérifier que rien ne casse, pas à calibrer) ?
 *
 * Il lit les constantes DANS index.html, donc suit le code. Pour chaque tête :
 *   K        largeur de tête / 153,2 mm (le gabarit de Google, 15,32 cm) ;
 *   K borné  ce que le code accepte réellement (K_TETE_MIN..K_TETE_MAX) ;
 *   jeu      écart entre la branche réglée et la tête au plan des oreilles.
 *            Négatif = la branche entre dans la tête.
 * Lancer : node outils/robustesse-tetes.js
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const num = n => { const m = src.match(new RegExp('(?:const|let|,)\\s*' + n + '\\s*=\\s*([0-9.]+)')); if (!m) throw new Error('constante introuvable : ' + n); return +m[1]; };
const DEMI_OREILLE = num('HEAD_EAR_HALFWIDTH_CM') * 10;      // mm
const JEU = num('TEMPLE_CLEARANCE_CM') * 10;
const KMIN = num('K_TETE_MIN'), KMAX = num('K_TETE_MAX');
const GABARIT_MM = DEMI_OREILLE * 2;                            // largeur du gabarit au plan des oreilles
const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '3dmodel', 'morphologies', 'H05_H30_robustness_manifest.json'), 'utf8'));

const lignes = [];
for (const h of man.heads) {
  const L = h.dimensions_mm.head_width;
  const K = L / GABARIT_MM;
  const Kb = Math.max(KMIN, Math.min(KMAX, K));
  const cible = DEMI_OREILLE * Kb + JEU;                        // demi-largeur visée pour la branche
  const jeu = cible - L / 2;                                    // contre la peau de la tête réelle
  lignes.push({ id: h.id, largeur: L, ipd: h.dimensions_mm.ipd, K: +K.toFixed(3), Kborne: +Kb.toFixed(3),
                sature: K < KMIN - 1e-3 ? 'trop étroite' : K > KMAX + 1e-3 ? 'trop large' : '', jeu_mm: +jeu.toFixed(1) });
}
console.log(`constantes lues dans index.html : demi-largeur ${DEMI_OREILLE} mm · jeu ${JEU} mm · K ${KMIN}–${KMAX} (têtes de ${(KMIN * GABARIT_MM).toFixed(0)} à ${(KMAX * GABARIT_MM).toFixed(0)} mm)\n`);
console.table(lignes);
const trop = lignes.filter(l => l.sature === 'trop large'), dedans = lignes.filter(l => l.jeu_mm < 0);
console.log(`têtes hors plage (trop larges) : ${trop.length} sur ${lignes.length} — ${trop.map(l => l.id).join(' ')}`);
console.log(`têtes où la branche entrerait dans le crâne : ${dedans.length} — pire cas ${Math.min(...lignes.map(l => l.jeu_mm))} mm`);
const reel = lignes.filter(l => l.largeur <= 165);
console.log(`dans la plage d'un adulte (≤ 165 mm) : ${reel.length} têtes, jeu de ${Math.min(...reel.map(l => l.jeu_mm))} à ${Math.max(...reel.map(l => l.jeu_mm))} mm`);
