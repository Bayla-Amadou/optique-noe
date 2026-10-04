/**
 * N.O.A — Mesures anonymes de la borne (mode collecte)
 *
 * But : savoir, après quelques centaines de clients, ce qui fait échouer
 * l'essayage sur de vraies têtes. Pas de photo, pas de nom, pas de numéro de
 * dossier : rien qui permette de retrouver une personne.
 *
 * Tout reste LOCAL. Un fichier ligne par ligne (mesures.ndjson) dans le
 * dossier de données de l'application, qu'on récupère par clé USB ou qu'on
 * enverra plus tard. Aucun réseau n'est nécessaire : la borne collecte
 * hors ligne exactement comme en ligne.
 *
 * La page ne décide pas de ce qui est écrit : elle propose un objet, et
 * valider() ne garde que les champs prévus, bornés. Un champ inconnu est
 * jeté, une chaîne libre est refusée. C'est ce qui garantit qu'aucune
 * donnée personnelle ne passe par ce canal, même par erreur de code.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Champs numériques autorisés, avec leurs bornes physiques.
const NOMBRES = {
  duree_s:[0, 3600], images:[0, 1e7], images_perdues:[0, 1e7],
  part_suit:[0, 1], part_degrade:[0, 1],
  effacements:[0, 1e4], reprises:[0, 1e4],
  k_tete:[0.5, 1.6], pd_mm:[40, 90], largeur_cm:[8, 20],
  yaw_max:[0, 120], pitch_max:[0, 90], roll_max:[0, 90],
  z_min_cm:[0, 300], z_max_cm:[0, 300],
  ms_image:[0, 5000], qualite_min:[0, 2], lumiere:[0, 20],
  changements_monture:[0, 1e3],
  // Morphologie mesurée sur la tête du client (voir morphologie.js) : millimètres, degrés,
  // confiances de 0 à 1. EXPÉRIMENTAL : sert à la validation terrain, pas à l'essayage.
  face_width_mm:[80, 200], face_height_mm:[100, 300], temple_width_mm:[80, 200],
  temple_half_right_mm:[40, 100], temple_half_left_mm:[40, 100],
  nose_width_mm:[15, 60], nose_bridge_y_mm:[-60, 100], nose_bridge_z_mm:[-60, 100], asym_pct:[0, 40],
  ear_depth_estimated_right:[30, 200], ear_depth_estimated_left:[30, 200],
  ear_dz_right_mm:[-50, 200], ear_dz_left_mm:[-50, 200],
  ear_height_right_mm:[-100, 100], ear_height_left_mm:[-100, 100],
  ear_depth_confidence_right:[0, 1], ear_depth_confidence_left:[0, 1],
  ear_depth_usable_right:[0, 1], ear_depth_usable_left:[0, 1],
  ear_yaw_right_deg:[0, 90], ear_yaw_left_deg:[0, 90],
  face_width_confidence:[0, 1], face_height_confidence:[0, 1], temple_width_confidence:[0, 1],
  nose_width_confidence:[0, 1], nose_bridge_confidence:[0, 1],
  measure_yaw_front_deg:[0, 90], measure_pitch_front_deg:[0, 90], measure_roll_front_deg:[0, 90],
  n_front:[0, 1e5], n_ear_right:[0, 1e5], n_ear_left:[0, 1e5],
};
// Champs texte : liste fermée ou motif court. Jamais de texte libre.
const TEXTES = {
  issue:   v => ['choisi', 'arrete', 'inactivite'].includes(v),
  forme:   v => ['oblong', 'cœur', 'diamant', 'rond', 'ovale', 'carré', 'rectangulaire'].includes(v),
  monture: v => /^[a-z0-9_-]{1,40}$/i.test(v),   // identifiant de catalogue, jamais saisi par le client
  build:   v => /^[A-Z]{1,3}$/.test(v),
  // Identifiant anonyme du participant (aléatoire, sans lien avec une personne).
  participant: v => /^[a-f0-9]{8}$/.test(v),
};
const LIMITE_OCTETS = 20 * 1024 * 1024;     // au-delà, l'ancien fichier est remplacé

function valider(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const [k, [mn, mx]] of Object.entries(NOMBRES)) {
    if (obj[k] == null) continue;
    const v = Number(obj[k]);
    if (!Number.isFinite(v) || v < mn || v > mx) continue;     // hors bornes : ignoré
    out[k] = Math.round(v * 1000) / 1000;
  }
  for (const [k, ok] of Object.entries(TEXTES)) {
    if (typeof obj[k] === 'string' && ok(obj[k])) out[k] = obj[k];
  }
  // Une séance sans durée ni images n'apprend rien.
  if (out.duree_s == null || out.images == null) return null;
  return out;
}

let _dossier = null;
function fichier(dossierDonnees) {
  _dossier = dossierDonnees || _dossier;
  return path.join(_dossier, 'mesures.ndjson');
}

function enregistrer(obj, infoBorne, dossierDonnees) {
  const d = valider(obj);
  if (!d) return { ok: false, raison: 'invalide' };
  const maintenant = new Date();
  const ligne = {
    id: crypto.randomBytes(6).toString('hex'),          // sans lien avec une personne
    borne: infoBorne && infoBorne.borne ? String(infoBorne.borne).slice(0, 40) : null,
    jour: maintenant.toISOString().slice(0, 10),
    heure: maintenant.getHours(),                       // l'heure seule : utile pour la lumière
    ...d,
  };
  const f = fichier(dossierDonnees);
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > LIMITE_OCTETS) fs.renameSync(f, f + '.1'); } catch (_) {}
    fs.appendFileSync(f, JSON.stringify(ligne) + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e.message };
  }
}

module.exports = { valider, enregistrer, fichier, NOMBRES, TEXTES };
