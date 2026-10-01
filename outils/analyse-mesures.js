/**
 * Lit les mesures anonymes d'une ou plusieurs bornes (mesures.ndjson) et dit
 * où l'essayage tient, où il casse, et quels réglages revoir.
 *
 *   node outils/analyse-mesures.js mesures.ndjson [autre.ndjson ...]
 *
 * Il ne modifie rien. Les « propositions » sont à valider par une personne :
 * une borne qui se règle seule en boutique serait imprévisible. On collecte,
 * on regarde, on décide, on met à jour borne.json ou le code.
 */
const fs = require('fs');
const fichiers = process.argv.slice(2);
if (!fichiers.length) { console.error('usage : node outils/analyse-mesures.js mesures.ndjson'); process.exit(2); }
const S = [];
for (const f of fichiers) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (l.trim()) try { S.push(JSON.parse(l)); } catch (_) {} }
if (!S.length) { console.log('aucune mesure'); process.exit(0); }
const q = (a, p) => { const t = a.filter(x => x != null).sort((x, y) => x - y); return t.length ? t[Math.min(t.length - 1, Math.floor(p * t.length))] : null; };
const col = k => S.map(s => s[k]);
const f = (x, d = 2) => x == null ? '—' : (+x).toFixed(d);
console.log(`${S.length} essayages · bornes : ${[...new Set(S.map(s => s.borne || '?'))].join(', ')} · du ${S.map(s => s.jour).sort()[0]} au ${S.map(s => s.jour).sort().pop()}`);
const issues = {}; S.forEach(s => issues[s.issue || '?'] = (issues[s.issue || '?'] || 0) + 1);
console.log('issue :', Object.entries(issues).map(([k, n]) => `${k} ${n} (${(100 * n / S.length).toFixed(0)} %)`).join(' · '));
console.log('\nmesure                  n     P5     médiane   P95');
const lignes = [['k_tete', 'largeur de tête (K)'], ['pd_mm', 'écart pupillaire mm'], ['largeur_cm', 'largeur de visage cm'],
  ['yaw_max', 'rotation max °'], ['pitch_max', 'inclinaison max °'], ['z_min_cm', 'distance mini cm'], ['part_suit', 'part en suivi'],
  ['ms_image', 'ms par image'], ['lumiere', 'gain de lumière'], ['duree_s', 'durée s']];
for (const [k, nom] of lignes) { const v = col(k).filter(x => x != null); console.log(nom.padEnd(22), String(v.length).padStart(4), f(q(v, .05)).padStart(8), f(q(v, .5)).padStart(8), f(q(v, .95)).padStart(8)); }

// Où ça casse
const mal = s => (s.part_suit != null && s.part_suit < 0.85) || (s.effacements || 0) >= 2;
const casse = S.filter(mal);
console.log(`\nessayages dégradés (suivi < 85 % ou ≥ 2 disparitions de la monture) : ${casse.length} sur ${S.length} (${(100 * casse.length / S.length).toFixed(0)} %)`);
const parHeure = {}; S.forEach(s => { const h = s.heure; parHeure[h] = parHeure[h] || { n: 0, m: 0 }; parHeure[h].n++; if (mal(s)) parHeure[h].m++; });
const critiques = Object.entries(parHeure).filter(([, v]) => v.n >= 5 && v.m / v.n > 0.3).map(([h, v]) => `${h} h (${v.m}/${v.n})`);
if (critiques.length) console.log('heures à problème :', critiques.join(' · '));
// Propositions
console.log('\n── propositions (à valider) ──');
const K = col('k_tete').filter(x => x != null);
if (K.length >= 20) {
  const bas = K.filter(x => x < 0.85).length, haut = K.filter(x => x > 1.10).length;
  console.log(`• K mesuré : ${f(q(K, .01))} à ${f(q(K, .99))} (P1–P99). Hors de la plage acceptée 0,85–1,10 : ${bas} trop étroites, ${haut} trop larges.`);
  if ((bas + haut) / K.length > 0.03) console.log('  → plus de 3 % des clients sortent de la plage : élargir K_TETE_MIN / K_TETE_MAX.');
  else console.log('  → la plage couvre plus de 97 % des clients : la garder.');
} else console.log(`• K : seulement ${K.length} mesures — attendre 20 essayages au moins.`);
const lent = S.filter(s => (s.ms_image || 0) > 80).length;
if (lent / S.length > 0.1) console.log(`• ${lent} essayages à plus de 80 ms par image : la machine est trop lente, baisser la qualité par défaut.`);
const perdu = S.filter(s => (s.images_perdues || 0) / (s.images || 1) > 0.1).length;
if (perdu / S.length > 0.1) console.log(`• ${perdu} essayages avec plus de 10 % d'images sans visage : voir la lumière ou la position de la caméra.`);
const sombre = S.filter(s => (s.lumiere || 1) < 0.5 && mal(s)).length;
if (sombre >= 3) console.log(`• ${sombre} essayages dégradés en lumière faible : l'exposition de la caméra est le prochain chantier.`);
if (S.length < 100) console.log(`\n(${S.length} essayages : en dessous de 100, les pourcentages sont indicatifs.)`);
