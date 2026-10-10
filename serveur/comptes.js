/**
 * N.O.A — Comptes du tableau de bord : nom d'utilisateur + mot de passe, deux rôles.
 *
 *   admin     tout : ventes, bornes, réglages, journal, dossiers
 *   opticien  dossiers des patients (et commandes) ; peut être limité à UNE boutique
 *
 * Les comptes viennent des secrets du serveur, jamais du dépôt :
 *
 *   NOA_COMPTES = utilisateur:role:empreinte[:boutique] ; utilisateur:role:empreinte ; ...
 *
 * `empreinte` est produite par  node serveur/outils/creer-compte.js  (scrypt, sel aléatoire) : le mot de
 * passe en clair n'est donc écrit nulle part. Une boutique en 4e champ limite l'opticien à ses dossiers.
 *
 * Raccourci pour démarrer : NOA_ADMIN_UTILISATEUR + NOA_ADMIN_MDP (un administrateur). Moins sûr — le mot
 * de passe est en clair dans l'environnement — mais l'environnement est déjà le coffre du serveur.
 * Ancien dispositif : NOA_MDP_ATELIER seul = un administrateur « atelier ». N'est lu que s'il n'y a rien d'autre.
 *
 * Sessions : jeton aléatoire gardé en mémoire (un redémarrage déconnecte tout le monde). Anti-force brute :
 * 5 échecs de suite pour un même utilisateur ou une même adresse = verrouillage de 15 minutes.
 */
const crypto = require('crypto');

const ROLES = ['admin', 'opticien'];
const UTILISATEUR = /^[a-zA-Z0-9._-]{2,40}$/;
const BOUTIQUE = /^[a-zA-Z0-9._ -]{1,60}$/;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const b64 = b => Buffer.from(b).toString('base64url');
function empreinte(mdp, sel) {
  sel = sel || crypto.randomBytes(16);
  const h = crypto.scryptSync(String(mdp), sel, 32, SCRYPT);
  return `scrypt.${b64(sel)}.${b64(h)}`;
}
function verifier(mdp, emp) {
  const [alg, s, h] = String(emp || '').split('.');
  if (alg !== 'scrypt' || !s || !h) return false;
  try {
    const attendu = Buffer.from(h, 'base64url');
    const calcule = crypto.scryptSync(String(mdp), Buffer.from(s, 'base64url'), attendu.length, SCRYPT);
    return attendu.length === calcule.length && crypto.timingSafeEqual(attendu, calcule);
  } catch (_) { return false; }
}

/** Lit les comptes depuis l'environnement. Renvoie { comptes, erreurs }. */
function lireComptes(env) {
  const comptes = new Map(), erreurs = [];
  const ajoute = (c, source) => {
    if (!UTILISATEUR.test(c.utilisateur)) return erreurs.push(`${source} : nom d'utilisateur invalide (2 à 40 caractères : lettres, chiffres, . _ -)`);
    if (!ROLES.includes(c.role)) return erreurs.push(`${source} : rôle « ${c.role} » inconnu (admin ou opticien)`);
    if (c.boutique && !BOUTIQUE.test(c.boutique)) return erreurs.push(`${source} : nom de boutique invalide`);
    if (comptes.has(c.utilisateur.toLowerCase())) return erreurs.push(`${source} : « ${c.utilisateur} » est déclaré deux fois`);
    comptes.set(c.utilisateur.toLowerCase(), c);
  };
  for (const part of String(env.NOA_COMPTES || '').split(';').map(x => x.trim()).filter(Boolean)) {
    const [utilisateur, role, emp, boutique] = part.split(':');
    if (!emp || !/^scrypt\.[\w-]+\.[\w-]+$/.test(emp)) { erreurs.push(`NOA_COMPTES : empreinte absente ou illisible pour « ${utilisateur} » (utiliser creer-compte.js)`); continue; }
    ajoute({ utilisateur, role, empreinte: emp, boutique: boutique || null }, 'NOA_COMPTES');
  }
  if (env.NOA_ADMIN_UTILISATEUR || env.NOA_ADMIN_MDP) {
    if (!env.NOA_ADMIN_UTILISATEUR || !env.NOA_ADMIN_MDP) erreurs.push('NOA_ADMIN_UTILISATEUR et NOA_ADMIN_MDP vont ensemble');
    else if (String(env.NOA_ADMIN_MDP).length < 12) erreurs.push('NOA_ADMIN_MDP : 12 caractères au moins');
    else ajoute({ utilisateur: env.NOA_ADMIN_UTILISATEUR, role: 'admin', empreinte: empreinte(env.NOA_ADMIN_MDP), boutique: null }, 'NOA_ADMIN_*');
  }
  if (!comptes.size && env.NOA_MDP_ATELIER)
    ajoute({ utilisateur: 'atelier', role: 'admin', empreinte: empreinte(env.NOA_MDP_ATELIER), boutique: null }, 'NOA_MDP_ATELIER');
  return { comptes, erreurs };
}

/** Moteur de connexion : vérifie, verrouille, ouvre des sessions. */
function creer(comptes, { dureeMs = 12 * 3600 * 1000, essais = 5, verrouMs = 15 * 60 * 1000, maintenant = Date.now } = {}) {
  const sessions = new Map(), echecs = new Map();
  const factice = empreinte(crypto.randomBytes(8).toString('hex'));          // temps constant si l'utilisateur n'existe pas
  const verrou = cle => { const e = echecs.get(cle); return e && e.n >= essais && maintenant() < e.jusqua ? e.jusqua - maintenant() : 0; };
  const rate = cle => { const e = echecs.get(cle) || { n: 0, jusqua: 0 }; if (maintenant() >= e.jusqua && e.n >= essais) e.n = 0; e.n++; e.jusqua = maintenant() + verrouMs; echecs.set(cle, e); };
  return {
    connecter(utilisateur, mdp, ip) {
      const u = String(utilisateur || '').trim().toLowerCase().slice(0, 40), cleU = 'u:' + u, cleIp = 'ip:' + (ip || '?');
      const attente = Math.max(verrou(cleU), verrou(cleIp));
      if (attente) return { ok: false, raison: 'verrouille', attente_s: Math.ceil(attente / 1000) };
      const c = comptes.get(u);
      const bon = verifier(mdp, c ? c.empreinte : factice) && !!c;
      if (!bon) { rate(cleU); rate(cleIp); return { ok: false, raison: 'refuse' }; }
      echecs.delete(cleU); echecs.delete(cleIp);
      const jeton = crypto.randomBytes(24).toString('hex');
      sessions.set(jeton, { utilisateur: c.utilisateur, role: c.role, boutique: c.boutique, exp: maintenant() + dureeMs });
      return { ok: true, jeton, compte: { utilisateur: c.utilisateur, role: c.role, boutique: c.boutique } };
    },
    session(jeton) {
      const s = sessions.get(String(jeton || '').trim());
      if (!s) return null;
      if (maintenant() > s.exp) { sessions.delete(jeton); return null; }
      return s;
    },
    fermer(jeton) { sessions.delete(String(jeton || '').trim()); },
    nettoyer() { const t = maintenant(); for (const [j, s] of sessions) if (t > s.exp) sessions.delete(j); for (const [k, e] of echecs) if (t > e.jusqua + verrouMs) echecs.delete(k); },
  };
}
module.exports = { ROLES, empreinte, verifier, lireComptes, creer };
