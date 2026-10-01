/* N.O.A — Pilotage · serveur de démonstration, dans le navigateur.
   Il répond aux mêmes appels que le vrai serveur, avec des données INVENTÉES,
   pour que l'interface se montre et se teste sans serveur. Rien ici ne
   représente de vrais clients : noms et numéros sont fabriqués. */
'use strict';
const Demo = (() => {
  let graine = 20260401;
  const alea = () => (graine = (graine * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = a => a[Math.floor(alea() * a.length)];
  const entier = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const iso = d => d.toISOString().replace('T', ' ').slice(0, 19);
  const PRENOMS = ['Amadou', 'Fatou', 'Moussa', 'Awa', 'Ibrahima', 'Aminata', 'Cheikh', 'Khady', 'Ousmane', 'Mariama', 'Abdoulaye', 'Sokhna', 'Mamadou', 'Rokhaya', 'Pape', 'Ndeye', 'Babacar', 'Coumba', 'Modou', 'Astou'];
  const NOMS = ['Diallo', 'Ndiaye', 'Sow', 'Fall', 'Gueye', 'Diop', 'Ba', 'Sarr', 'Faye', 'Mbaye', 'Cissé', 'Sy', 'Thiam', 'Seck', 'Kane', 'Niang'];
  const MONTURES = [['Cube', 'cube'], ['Frame 01', 'frame01'], ['Classic', 'classic'], ['Noir', 'noir'], ['Glasses 11', 'glasses11']];
  const FORMES = ['ovale', 'rond', 'diamant', 'cœur', 'oblong'];
  const BORNES = [
    { nom: 'dakar-plateau-1', boutique: 'Plateau' }, { nom: 'dakar-plateau-2', boutique: 'Plateau' },
    { nom: 'almadies-1', boutique: 'Almadies' }, { nom: 'thies-1', boutique: 'Thiès' }, { nom: 'saint-louis-1', boutique: 'Saint-Louis' }];

  const E = { dossiers: [], notes: {}, journal: {}, commandes: [], audit: [], reglages: { global: {}, bornes: {} }, version: 1, mesuresN: 0 };
  let cmdId = 1;

  function init() {
    graine = 20260401;
    const maintenant = Date.now();
    for (let i = 0; i < 230; i++) {
      const jours = Math.floor(Math.pow(alea(), 1.15) * 88), b = pick(BORNES), recu = new Date(maintenant - jours * 864e5 - entier(0, 12) * 36e5 - entier(0, 59) * 6e4);
      recu.setUTCHours(Math.max(8, Math.min(19, recu.getUTCHours() % 12 + 8)));
      const express = alea() < .28, spray = alea() < .35, m = pick(MONTURES);
      const montant = 25000 + (express ? 5000 : 0) + (spray ? 1000 : 0), age = jours;
      const etat = age > 8 ? (alea() < .985 ? 'livre' : 'pret') : age > 4 ? pick(['en_fabrication', 'pret', 'livre']) : age > 1 ? pick(['recu', 'en_fabrication', 'en_fabrication']) : 'recu';
      const prenom = pick(PRENOMS), nom = pick(NOMS), id = 'C' + (1000 + i);
      const d = { id, boutique: b.boutique, nom: prenom + ' ' + nom, tel: pick(['77', '78', '76', '70', '75']) + entier(1000000, 9999999),
        monture: m[0], extras: [express ? 'Option Express 48h' : null, spray ? 'Spray nettoyant' : null].filter(Boolean).join(', '),
        paiement: alea() < .62 ? 'Wave' : 'Orange', montant, pd_mm: +(58 + alea() * 10).toFixed(1), face_width_cm: +(13 + alea() * 2).toFixed(1), face_shape: pick(FORMES),
        date: recu.toISOString(), etat, recu_le: iso(recu), maj_le: iso(recu), livre_le: null, purge_le: null, consentement: 'v2026-09-1', consentement_le: iso(recu), borne: b.nom, photos: ['ordonnance', 'essai'] };
      if (etat === 'livre') d.livre_le = iso(new Date(recu.getTime() + (express ? 40 : 90) * 36e5));
      E.dossiers.push(d);
      E.journal[id] = [{ quand: iso(recu), action: 'recu', detail: b.boutique }];
      if (etat !== 'recu') E.journal[id].push({ quand: iso(new Date(recu.getTime() + 20 * 36e5)), action: 'etat', detail: 'en_fabrication' });
      if (etat === 'pret' || etat === 'livre') E.journal[id].push({ quand: iso(new Date(recu.getTime() + 60 * 36e5)), action: 'etat', detail: 'pret' });
      if (etat === 'livre') E.journal[id].push({ quand: d.livre_le, action: 'etat', detail: 'livre' });
    }
    E.dossiers.sort((a, b) => (a.recu_le < b.recu_le ? 1 : -1));
    E.notes[E.dossiers[2].id] = [{ quand: iso(new Date(maintenant - 5 * 36e5)), texte: 'Cliente rappelée : passera récupérer samedi.' }];
    E.mesuresN = 310;
    E.audit = [
      { quand: iso(new Date(maintenant - 26 * 36e5)), qui: 'atelier', action: 'reglages', cible: 'global', detail: 'prix, paiements' },
      { quand: iso(new Date(maintenant - 7 * 36e5)), qui: 'atelier', action: 'commande', cible: 'thies-1', detail: 'recharger' }];
  }

  const bornes = () => {
    const v = E.version, cat = [{ id: 'cube', name: 'Cube' }, { id: 'frame01', name: 'Frame 01' }, { id: 'classic', name: 'Classic' }, { id: 'noir', name: 'Noir' }, { id: 'glasses11', name: 'Glasses 11' }];
    const base = [
      { nom: 'dakar-plateau-1', boutique: 'Plateau', build: 'BJ', silence_s: 25, statut: 'en_ligne', etat: { camera: 'inactive', cameras: 1, file_attente: 0, memoire_mo: 610, session: false, collecte: true, reglages_version: v, maj: 'a_jour', catalogue: cat, uptime_s: 86400 * 3 }, alertes: [] },
      { nom: 'dakar-plateau-2', boutique: 'Plateau', build: 'BJ', silence_s: 40, statut: 'en_ligne', etat: { camera: 'ok', cameras: 1, file_attente: 2, memoire_mo: 720, session: true, collecte: true, reglages_version: v, maj: 'a_jour', catalogue: cat, uptime_s: 86400 * 3 }, alertes: [] },
      { nom: 'almadies-1', boutique: 'Almadies', build: 'BI', silence_s: 330, statut: 'retard', etat: { camera: 'inactive', cameras: 1, file_attente: 14, memoire_mo: 900, session: false, collecte: true, reglages_version: v - 1, maj: 'prete', maj_version: '1.0.2', catalogue: cat, uptime_s: 86400 }, alertes: [{ niveau: 'attention', texte: 'Signe de vie en retard' }, { niveau: 'info', texte: 'Mise à jour 1.0.2 prête : installation cette nuit' }, { niveau: 'info', texte: 'Version BI (la plus récente : BJ)' }] },
      { nom: 'thies-1', boutique: 'Thiès', build: 'BJ', silence_s: 52, statut: 'en_ligne', etat: { camera: 'perdue', cameras: 1, file_attente: 41, memoire_mo: 1840, session: true, collecte: false, reglages_version: v, maj: 'a_jour', catalogue: cat, uptime_s: 86400 * 9 }, alertes: [{ niveau: 'critique', texte: 'Caméra perdue pendant un essayage' }, { niveau: 'attention', texte: "41 dossiers en attente d'envoi" }, { niveau: 'attention', texte: 'Mémoire élevée (1840 Mo)' }] },
      { nom: 'saint-louis-1', boutique: 'Saint-Louis', build: 'BG', silence_s: 7200, statut: 'hors_ligne', etat: { camera: 'absente', cameras: 0, file_attente: 6, memoire_mo: null, session: false, collecte: true, reglages_version: v - 2, maj: 'erreur', catalogue: cat, uptime_s: 0 }, alertes: [{ niveau: 'critique', texte: 'Ne répond plus' }, { niveau: 'critique', texte: 'Aucune caméra détectée' }, { niveau: 'attention', texte: 'La mise à jour automatique a échoué' }, { niveau: 'info', texte: 'Version BG (la plus récente : BJ)' }] }];
    for (const b of base) {
      const rb = E.reglages.bornes[b.nom];
      if (rb && rb.maintenance && rb.maintenance.actif) { b.etat.maintenance = true; b.alertes.push({ niveau: 'info', texte: 'En maintenance (écran verrouillé pour les clients)' }); }
      b.reglages_a_jour = b.etat.reglages_version === v;
      if (!b.reglages_a_jour && b.statut === 'en_ligne') b.alertes.push({ niveau: 'info', texte: `Réglages en attente (v${b.etat.reglages_version} sur v${v})` });
    }
    return base;
  };

  /* mêmes filtres que le vrai serveur */
  const filtrer = q => {
    let l = E.dossiers.slice();
    if (q.etat) l = l.filter(d => d.etat === q.etat);
    if (q.boutique) l = l.filter(d => d.boutique === q.boutique);
    if (q.borne) l = l.filter(d => d.borne === q.borne);
    if (q.du) l = l.filter(d => d.recu_le.slice(0, 10) >= q.du);
    if (q.au) l = l.filter(d => d.recu_le.slice(0, 10) <= q.au);
    if (q.q) { const t = q.q.toLowerCase(); l = l.filter(d => [d.nom, d.tel, d.id, d.monture].some(x => String(x).toLowerCase().includes(t))); }
    return l;
  };
  const jourIso = d => new Date(d).toISOString().slice(0, 10);

  function ventes(q) {
    const jours = +q.jours || 30, aujourdhui = Date.now();
    const l = filtrer({ boutique: q.boutique, borne: q.borne });
    const dansPeriode = (d, de, a) => { const t = new Date(d.recu_le.replace(' ', 'T') + 'Z').getTime(), j = (aujourdhui - t) / 864e5; return j >= a && j < de; };
    const cur = l.filter(d => dansPeriode(d, jours, -1)), prev = l.filter(d => dansPeriode(d, 2 * jours, jours));
    const somme = x => x.reduce((s, d) => s + d.montant, 0);
    const groupe = (x, cle) => { const m = {}; x.forEach(d => { const k = cle(d) || 'Non renseigné'; (m[k] = m[k] || { n: 0, ca: 0 }); m[k].n++; m[k].ca += d.montant; }); return Object.entries(m).map(([nom, v]) => ({ nom, ...v })).sort((a, b) => b.ca - a.ca); };
    const par_jour = []; for (let i = jours - 1; i >= 0; i--) par_jour.push({ jour: jourIso(aujourdhui - i * 864e5), n: 0, ca: 0 });
    const idx = Object.fromEntries(par_jour.map(p => [p.jour, p])); cur.forEach(d => { const p = idx[d.recu_le.slice(0, 10)]; if (p) { p.n++; p.ca += d.montant; } });
    const par_heure = Array.from({ length: 24 }, (_, h) => ({ heure: h, n: 0 })), par_semaine = Array.from({ length: 7 }, (_, j) => ({ jour: j, n: 0 }));
    cur.forEach(d => { const t = new Date(d.recu_le.replace(' ', 'T') + 'Z'); par_heure[t.getUTCHours()].n++; par_semaine[t.getUTCDay()].n++; });
    const liv = cur.filter(d => d.livre_le), hh = liv.map(d => (new Date(d.livre_le.replace(' ', 'T') + 'Z') - new Date(d.recu_le.replace(' ', 'T') + 'Z')) / 36e5);
    const essayages = Math.round(cur.length / 0.31);
    const etats = { recu: 0, en_fabrication: 0, pret: 0, livre: 0 }; l.forEach(d => etats[d.etat]++);
    const en_retard = l.filter(d => d.etat !== 'livre' && (aujourdhui - new Date(d.recu_le.replace(' ', 'T') + 'Z')) / 864e5 > +(q.retard_jours || 5)).slice(0, 20).map(d => ({ id: d.id, nom: d.nom, etat: d.etat, monture: d.monture, recu_le: d.recu_le, jours: Math.floor((aujourdhui - new Date(d.recu_le.replace(' ', 'T') + 'Z')) / 864e5) }));
    return { ok: true, jours, commandes: cur.length, ca: somme(cur), panier_moyen: cur.length ? Math.round(somme(cur) / cur.length) : 0, precedent: { commandes: prev.length, ca: somme(prev) },
      avec_express: cur.filter(d => /express/i.test(d.extras)).length, avec_spray: cur.filter(d => /spray/i.test(d.extras)).length, par_jour, par_paiement: groupe(cur, d => d.paiement), par_monture: groupe(cur, d => d.monture).slice(0, 10),
      par_boutique: groupe(cur, d => d.boutique), par_borne: groupe(cur, d => d.borne), par_forme: groupe(cur, d => d.face_shape), par_heure, par_semaine, etats,
      delai_livraison_h: hh.length ? Math.round(hh.reduce((a, b) => a + b, 0) / hh.length) : null, livrees: liv.length, essayages, essayages_choisis: Math.round(essayages * .42), conversion: essayages ? cur.length / essayages : null, en_retard };
  }

  function stats() {
    const hist = (v, mn, mx, pas) => { const n = Math.round((mx - mn) / pas), b = Array.from({ length: n }, (_, i) => ({ de: +(mn + i * pas).toFixed(3), n: 0 })); v.forEach(x => { b[Math.max(0, Math.min(n - 1, Math.floor((x - mn) / pas)))].n++; }); return b; };
    const gauss = () => Math.sqrt(-2 * Math.log(alea() + 1e-9)) * Math.cos(6.2832 * alea());
    const K = [], SU = [], ph = Array.from({ length: 24 }, (_, h) => ({ heure: h, n: 0, degrades: 0 }));
    for (let i = 0; i < E.mesuresN; i++) { const h = 9 + Math.floor(alea() * 11), sombre = h >= 17 && alea() < .5; K.push(Math.max(.72, Math.min(1.28, 1 + gauss() * .075))); const su = sombre ? .55 + alea() * .3 : Math.min(1, .88 + alea() * .12); SU.push(su); ph[h].n++; if (su < .85 || alea() < .03) ph[h].degrades++; }
    const q = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
    return { ok: true, jours: 30, n: E.mesuresN, degrades: ph.reduce((s, h) => s + h.degrades, 0), issues: { choisi: 130, arrete: 180 },
      k: { n: K.length, p5: q(K, .05), med: q(K, .5), p95: q(K, .95), hors_plage_bas: K.filter(x => x < .85).length, hors_plage_haut: K.filter(x => x > 1.1).length, histogramme: hist(K, .7, 1.3, .025) },
      suivi: { n: SU.length, p5: q(SU, .05), med: q(SU, .5), p95: q(SU, .95), histogramme: hist(SU, 0, 1.0001, .1) }, pd: { n: K.length, med: 62 }, lumiere: { n: K.length, med: .9 }, ms_image: { n: K.length, med: 28 }, par_heure: ph };
  }

  /* images de démonstration : des SVG, jamais de vraies photos */
  const svgOrdonnance = id => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fbfbf7"/><rect x="14" y="14" width="372" height="272" fill="none" stroke="#b9c4d6"/><text x="30" y="44" font-family="sans-serif" font-size="15" font-weight="700" fill="#33415c">ORDONNANCE — EXEMPLE</text><text x="30" y="64" font-family="sans-serif" font-size="11" fill="#6b7a93">Dossier ${id} · document fictif</text><line x1="30" y1="76" x2="370" y2="76" stroke="#d7deea"/><g font-family="monospace" font-size="13" fill="#33415c"><text x="30" y="108">OD  sph -1.25  cyl -0.50  axe 90°</text><text x="30" y="134">OG  sph -1.00  cyl -0.25  axe 80°</text><text x="30" y="160">Addition +1.50      EP 63 mm</text></g><g stroke="#d7deea"><line x1="30" y1="192" x2="370" y2="192"/><line x1="30" y1="214" x2="300" y2="214"/><line x1="30" y1="236" x2="340" y2="236"/></g><text x="250" y="270" font-family="cursive" font-size="22" fill="#2a78d6">Dr. Démo</text></svg>`;
  const svgEssai = nom => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9eef6"/><circle cx="200" cy="130" r="82" fill="#c9a384"/><path d="M118 300c4-62 40-84 82-84s78 22 82 84z" fill="#3b6fb0"/><g fill="none" stroke="#14233a" stroke-width="7"><rect x="136" y="108" width="52" height="38" rx="9"/><rect x="212" y="108" width="52" height="38" rx="9"/><path d="M188 124h24"/></g><text x="200" y="288" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#6b7a93">Portrait d'essai — exemple · ${nom}</text></svg>`;

  const audit = (action, cible, detail) => E.audit.unshift({ quand: iso(new Date()), qui: 'atelier', action, cible: cible || null, detail: detail || null });
  const ok = x => Promise.resolve(x);
  const echec = (code, msg) => Promise.reject(Object.assign(new Error(msg || code), { code }));

  function api(chemin, opts = {}) {
    const [p, qs] = chemin.split('?'), q = Object.fromEntries(new URLSearchParams(qs || '')), body = opts.body ? JSON.parse(opts.body) : {};
    let m;
    if (p === '/api/flotte') return ok({ ok: true, bornes: bornes(), build_recent: 'BJ' });
    if (p === '/api/mesures/stats') return ok(stats());
    if (p === '/api/ventes/stats') return ok(ventes(q));
    if (p === '/api/dossiers') {
      const l = filtrer(q), lim = Math.min(200, +q.limite || 100), dec = +q.decalage || 0;
      return ok({ ok: true, total: l.length, dossiers: l.slice(dec, dec + lim) });
    }
    if (p === '/api/dossiers.csv') {
      const l = filtrer(q), cols = ['id', 'recu_le', 'etat', 'boutique', 'borne', 'nom', 'tel', 'monture', 'extras', 'paiement', 'montant'];
      audit('export_csv', null, l.length + ' dossiers');
      return ok({ texte: '﻿' + cols.join(',') + '\n' + l.map(d => cols.map(c => '"' + String(d[c] == null ? '' : d[c]).replace(/"/g, '""') + '"').join(',')).join('\n') });
    }
    if ((m = p.match(/^\/api\/dossiers\/([^/]+)\/etat$/))) { const d = E.dossiers.find(x => x.id === m[1]); if (!d) return echec('inconnu'); d.etat = body.etat; d.maj_le = iso(new Date()); if (body.etat === 'livre') d.livre_le = iso(new Date()); E.journal[d.id].push({ quand: iso(new Date()), action: 'etat', detail: body.etat }); audit('etat', d.id, body.etat); return ok({ ok: true, etat: body.etat }); }
    if ((m = p.match(/^\/api\/dossiers\/([^/]+)\/note$/))) { const d = E.dossiers.find(x => x.id === m[1]); if (!d) return echec('inconnu'); (E.notes[d.id] = E.notes[d.id] || []).push({ quand: iso(new Date()), texte: String(body.texte).slice(0, 500) }); audit('note', d.id, String(body.texte).slice(0, 80)); return ok({ ok: true }); }
    if ((m = p.match(/^\/api\/dossiers\/([^/]+)$/))) { const d = E.dossiers.find(x => x.id === m[1]); if (!d) return echec('inconnu'); return ok({ ok: true, dossier: d, journal: E.journal[d.id] || [], notes: E.notes[d.id] || [] }); }
    if ((m = p.match(/^\/api\/photo\/([^/]+)\/(ordonnance|essai)$/))) { const d = E.dossiers.find(x => x.id === m[1]); if (!d) return echec('inconnu'); return ok({ blob: new Blob([m[2] === 'ordonnance' ? svgOrdonnance(d.id) : svgEssai(d.nom)], { type: 'image/svg+xml' }) }); }
    if (p === '/api/reglages' && opts.method === 'POST') {
      const portee = body.portee; const donnees = body.donnees || {};
      if (portee === 'global') E.reglages.global = donnees; else E.reglages.bornes[String(portee).slice(6)] = donnees;
      E.version++; audit('reglages', portee, Object.keys(donnees).join(', ') || '(vide)'); return ok({ ok: true, version: E.version, donnees });
    }
    if (p === '/api/reglages') return ok({ ok: true, version: E.version, global: E.reglages.global, bornes: E.reglages.bornes });
    if (p === '/api/commande') { E.commandes.unshift({ id: cmdId++, borne: body.borne, action: body.action, cree_le: iso(new Date()), envoyee_le: null, accusee_le: null, resultat: null }); audit('commande', body.borne, body.action); return ok({ ok: true, id: cmdId }); }
    if (p === '/api/commandes') return ok({ ok: true, commandes: E.commandes });
    if (p === '/api/audit') return ok({ ok: true, lignes: E.audit });
    return echec('introuvable', 'Appel inconnu en démonstration : ' + p);
  }

  init();
  return { api, init };
})();
