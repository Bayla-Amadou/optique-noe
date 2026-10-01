/**
 * N.O.A — Réglages poussés aux bornes : la liste fermée
 *
 * Ce fichier existe en deux exemplaires identiques : à la racine (la borne) et
 * dans serveur/ (le serveur). Le serveur valide ce que l'administrateur
 * écrit ; la borne le REVALIDE en le recevant. Une borne ne fait donc jamais
 * confiance au réseau, même au sien.
 *
 * Règle : tout champ inconnu ou hors bornes est ABANDONNÉ, jamais « corrigé ».
 * Un réglage absurde ne doit pas atteindre une borne, ni la faire planter.
 */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const entier = (v, mn, mx) => { v = Number(v); return Number.isInteger(v) && v >= mn && v <= mx ? v : undefined; };
const reel = (v, mn, mx) => { v = Number(v); return Number.isFinite(v) && v >= mn && v <= mx ? Math.round(v * 1000) / 1000 : undefined; };
const texte = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : undefined;
const vide = o => !Object.values(o).some(x => x !== undefined);

/**
 * Valide et nettoie un objet de réglages. Tout champ inconnu ou hors bornes
 * est ABANDONNÉ, jamais corrigé : un réglage absurde ne doit pas atteindre
 * une borne. C'est la borne qui revalide en réception.
 */
function validerReglages(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {};
  const out = {};
  if (r.maintenance && typeof r.maintenance === 'object') {
    out.maintenance = { actif: !!r.maintenance.actif, message: texte(r.maintenance.message, 160) || '' };
  }
  if (r.accueil && typeof r.accueil === 'object') {
    const m = texte(r.accueil.message, 120); out.accueil = { message: m || '' };
  }
  if (r.horaires && typeof r.horaires === 'object') {
    const h = r.horaires, jours = Array.isArray(h.jours) ? [...new Set(h.jours.map(Number).filter(j => Number.isInteger(j) && j >= 0 && j <= 6))].sort() : [0, 1, 2, 3, 4, 5, 6];
    if (HHMM.test(h.debut || '') && HHMM.test(h.fin || '')) out.horaires = { actif: !!h.actif, debut: h.debut, fin: h.fin, jours };
  }
  const ina = entier(r.inactivite_s, 30, 600); if (ina !== undefined) out.inactivite_s = ina;
  if (r.paiements && typeof r.paiements === 'object') out.paiements = { wave: r.paiements.wave !== false, orange: r.paiements.orange !== false };
  if (r.prix && typeof r.prix === 'object') {
    const p = { base: entier(r.prix.base, 1000, 2000000), express: entier(r.prix.express, 0, 500000), spray: entier(r.prix.spray, 0, 500000) };
    if (!vide(p)) out.prix = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  }
  if (r.catalogue && Array.isArray(r.catalogue.masquees)) {
    out.catalogue = { masquees: [...new Set(r.catalogue.masquees.filter(x => typeof x === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x)))].slice(0, 200) };
  }
  if (r.suivi && typeof r.suivi === 'object') {
    const s = { k_min: reel(r.suivi.k_min, 0.7, 0.95), k_max: reel(r.suivi.k_max, 1.0, 1.35),
                fondu_debut_cm: reel(r.suivi.fondu_debut_cm, -9, -4), fondu_fin_cm: reel(r.suivi.fondu_fin_cm, -11, -6),
                maintien_ms: entier(r.suivi.maintien_ms, 300, 3000) };
    if (!vide(s)) out.suivi = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));
    // Un fondu qui finirait avant de commencer n'a pas de sens.
    if (out.suivi && out.suivi.fondu_debut_cm != null && out.suivi.fondu_fin_cm != null && out.suivi.fondu_fin_cm >= out.suivi.fondu_debut_cm) delete out.suivi.fondu_fin_cm;
  }
  if (HHMM.test(r.redemarrage || '')) out.redemarrage = r.redemarrage;
  if (r.mise_a_jour && typeof r.mise_a_jour === 'object') {
    out.mise_a_jour = { autorisee: r.mise_a_jour.autorisee !== false };
  }
  return out;
}

/** Réglages effectifs d'une borne : le global, recouvert par ceux de la borne (clé par clé). */
function fusion(global, borne) {
  const out = { ...(global || {}) };
  for (const [k, v] of Object.entries(borne || {})) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) ? { ...out[k], ...v } : v;
  }
  return out;
}


module.exports = { validerReglages, fusion, texte, HHMM };
