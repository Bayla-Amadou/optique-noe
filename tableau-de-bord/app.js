/* N.O.A — Pilotage · cœur de l'application : outils, connexion, navigation, fenêtres. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = Graph.esc;
const nf = n => n == null ? '—' : new Intl.NumberFormat('fr-FR').format(Math.round(n));
const dec = (n, d = 2) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fcfa = n => n == null ? '—' : nf(n) + ' FCFA';
const pct = (n, d = 0) => n == null ? '—' : (n * 100).toFixed(d).replace('.', ',') + ' %';
const parse = s => new Date(String(s).replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z'));
const depuis = s => { const d = (Date.now() - (typeof s === 'number' ? s : parse(s).getTime())) / 1000; return d < 90 ? "à l'instant" : d < 3600 ? 'il y a ' + Math.round(d / 60) + ' min' : d < 86400 ? 'il y a ' + Math.round(d / 3600) + ' h' : d < 86400 * 14 ? 'il y a ' + Math.round(d / 86400) + ' j' : 'le ' + parse(s).toLocaleDateString('fr-FR'); };
const silence = s => s == null ? '—' : s < 90 ? "à l'instant" : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : s < 86400 ? 'il y a ' + Math.round(s / 3600) + ' h' : 'il y a ' + Math.round(s / 86400) + ' j';
const dateCourte = s => parse(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
const dateHeure = s => parse(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const initiales = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const telNettoye = t => String(t || '').replace(/\D/g, '');
const telWhatsapp = t => { let n = telNettoye(t); if (n.length === 9) n = '221' + n; return n; };
const telAffiche = t => { const n = telNettoye(t); return n.length === 9 ? n.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4') : String(t || ''); };

/* ── Icônes (traits de 1,8 px, héritent la couleur du texte) ── */
const I = {};
['home|M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', 'board|M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z', 'folder|M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'euro|M5 12h9M5 9h9M17.5 6.2A6 6 0 1 0 17.5 17.8', 'chart|M4 20V10M10 20V4M16 20v-7M22 20H2', 'kiosk|M6 3h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5v3h3M11 21H8M6 3v15h12', 'eye|M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'sliders|M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M13 4v4M7 10v4M17 16v4', 'list|M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', 'search|M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5',
  'bell|M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0', 'moon|M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z', 'menu|M4 6h16M4 12h16M4 18h16', 'x|M6 6l12 12M18 6L6 18',
  'phone|M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z', 'chat|M4 5h16v11H9l-5 4z', 'copy|M9 9h11v11H9zM5 15V5h10', 'download|M12 4v11M7 11l5 5 5-5M5 20h14',
  'check|M5 12.5l4.5 4.5L19 7', 'alert|M12 3l10 18H2zM12 10v5M12 18v.5', 'info|M12 11v6M12 7.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'clock|M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  'tool|M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z', 'tag|M3 12V4h8l10 10-8 8zM7.5 8.5h.01', 'card|M3 6h18v12H3zM3 10h18', 'glasses|M2 14a4 4 0 0 0 8 0 4 4 0 0 0-8 0zM14 14a4 4 0 0 0 8 0 4 4 0 0 0-8 0zM10 13h4M2 13l2-6M22 13l-2-6',
  'refresh|M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5', 'power|M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0', 'cloud|M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z', 'arrow|M5 12h14M13 6l6 6-6 6', 'up|M6 15l6-6 6 6', 'down|M6 9l6 6 6-6',
  'store|M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0', 'user|M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', 'lock|M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', 'shield|M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'calendar|M4 6h16v14H4zM4 10h16M8 3v4M16 3v4']
  .forEach(s => { const [k, d] = s.split('|'); I[k] = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`; });

/* ── État de l'application ── */
const App = {
  mode: 'demo', url: '', jeton: '', espace: 'admin', route: '', timer: null,
  flotte: null, periode: 30, alertes: 0,
  stock: { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } },
  session: { get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }, del(k) { try { sessionStorage.removeItem(k); } catch (_) {} } },
};

/* ── Appels : serveur réel ou démonstration ── */
class ErreurApi extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
async function api(chemin, opts = {}) {
  if (App.mode === 'demo') {
    try { return await Demo.api(chemin, { ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { throw new ErreurApi(e.code || 'demo', e.message); }
  }
  const r = await fetch(App.url.replace(/\/$/, '') + chemin, { ...opts, headers: { 'Content-Type': 'application/json', 'X-NOA-Session': App.jeton, ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { deconnecter('Session expirée : reconnectez-vous.'); throw new ErreurApi('session', 'Session expirée'); }
  if (opts.brut) { if (!r.ok) throw new ErreurApi(String(r.status)); return r; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurApi(j.erreur || String(r.status), j.erreur || ('Erreur ' + r.status));
  return j;
}
const urlsPhotos = new Map();   // une image récupérée avec l'en-tête de session devient une URL locale
async function photo(id, nom) {
  const cle = id + '/' + nom; if (urlsPhotos.has(cle)) return urlsPhotos.get(cle);
  try {
    let blob;
    if (App.mode === 'demo') blob = (await Demo.api(`/api/photo/${id}/${nom}`, {})).blob;
    else blob = await (await api(`/api/photo/${encodeURIComponent(id)}/${nom}`, { brut: true })).blob();
    const u = URL.createObjectURL(blob); urlsPhotos.set(cle, u); return u;
  } catch (_) { return null; }
}
function libererPhotos() { urlsPhotos.forEach(u => URL.revokeObjectURL(u)); urlsPhotos.clear(); }

/* ── Notifications et fenêtres ── */
function toast(msg, erreur) {
  const c = $('#toasts'), t = document.createElement('div'); t.className = 'toast' + (erreur ? ' erreur' : ''); t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, erreur ? 5200 : 3200);
}
function confirmer({ titre, texte, bouton = 'Confirmer', danger = false, html }) {
  return new Promise(res => {
    const d = $('#dlgConfirm'); $('#dcTitre').textContent = titre; $('#dcTexte').innerHTML = html || esc(texte || '');
    const ok = $('#dcOk'); ok.textContent = bouton; ok.className = 'btn ' + (danger ? 'danger' : 'principal');
    const fin = v => { d.close(); ok.onclick = null; $('#dcAnnuler').onclick = null; res(v); };
    ok.onclick = () => fin(true); $('#dcAnnuler').onclick = () => fin(false); d.oncancel = () => res(false); d.showModal();
  });
}
const panneau = {
  ouvrir(html, { onFermer } = {}) { $('#panneauCorps').innerHTML = html; $('#panneauFond').classList.add('on'); $('#panneau').classList.add('on'); $('#panneau').setAttribute('aria-hidden', 'false'); this.onFermer = onFermer; setTimeout(() => $('#panneau .fermer-panneau')?.focus(), 50); },
  fermer() { $('#panneauFond').classList.remove('on'); $('#panneau').classList.remove('on'); $('#panneau').setAttribute('aria-hidden', 'true'); if (this.onFermer) this.onFermer(); this.onFermer = null; },
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#lightbox').classList.contains('on')) $('#lightbox').classList.remove('on'); else panneau.fermer(); } });
function lightbox(src) { $('#lightboxImg').src = src; $('#lightbox').classList.add('on'); }

/* ── Navigation ── */
const MENUS = {
  opticien: [
    { titre: 'Atelier' }, { r: 'opticien/commandes', nom: 'Commandes', ic: 'board', compteur: 'aTraiter' }, { r: 'opticien/dossiers', nom: 'Dossiers patients', ic: 'folder' }],
  admin: [
    { titre: 'Pilotage' }, { r: 'admin/apercu', nom: "Vue d'ensemble", ic: 'home' }, { r: 'admin/ventes', nom: 'Ventes', ic: 'euro' },
    { titre: 'Parc de bornes' }, { r: 'admin/bornes', nom: 'Bornes', ic: 'kiosk', compteur: 'alertes' }, { r: 'admin/qualite', nom: "Qualité d'essayage", ic: 'eye' },
    { titre: 'Configuration' }, { r: 'admin/reglages', nom: 'Réglages', ic: 'sliders' }, { r: 'admin/journal', nom: 'Journal', ic: 'list' }],
};
const TITRES = { 'opticien/commandes': ['Commandes', "Suivez chaque dossier, de la réception à la livraison."], 'opticien/dossiers': ['Dossiers patients', 'Recherche, ordonnance scannée, contact.'],
  'admin/apercu': ["Vue d'ensemble", 'Ventes, parc de bornes et points à surveiller.'], 'admin/ventes': ['Ventes', 'Chiffre d’affaires, panier, conversion, délais.'], 'admin/bornes': ['Bornes', 'État du parc, ordres à distance.'],
  'admin/qualite': ["Qualité d'essayage", 'Mesures anonymes recueillies sur les bornes.'], 'admin/reglages': ['Réglages', 'Ce qui est envoyé aux bornes : prix, paiements, horaires, maintenance, mises à jour.'], 'admin/journal': ['Journal', 'Qui a changé quoi, et quand.'] };

function dessinerMenu() {
  const menu = MENUS[App.espace];
  $('#nav').innerHTML = menu.map(m => m.titre ? `<div class="titre">${esc(m.titre)}</div>`
    : `<a href="#/${m.r}" data-r="${m.r}">${I[m.ic]}<span>${esc(m.nom)}</span>${m.compteur === 'alertes' && App.alertes ? `<span class="compteur">${App.alertes}</span>` : ''}${m.compteur === 'aTraiter' && App.aTraiter ? `<span class="compteur doux">${App.aTraiter}</span>` : ''}</a>`).join('');
  $$('.espaces button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.espace === App.espace)));
  majMenuActif();
}
function majMenuActif() { $$('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.r === App.route ? 'page' : 'false')); }
function changerEspace(e) { App.espace = e; App.stock.set('noa-espace', e); location.hash = '#/' + MENUS[e].find(m => m.r).r; }

async function router() {
  const h = location.hash.replace(/^#\/?/, '') || (App.espace + '/' + MENUS[App.espace].find(m => m.r).r.split('/')[1]);
  const [esp] = h.split('/'); if (MENUS[esp] && esp !== App.espace) { App.espace = esp; App.stock.set('noa-espace', esp); }
  App.route = MENUS[App.espace].some(m => m.r === h) ? h : MENUS[App.espace].find(m => m.r).r;
  dessinerMenu(); panneau.fermer();
  const [t, s] = TITRES[App.route] || ['', '']; $('#titrePage').textContent = t; $('#sousTitrePage').textContent = s; document.title = t + ' · N.O.A Pilotage';
  $('#lateral').classList.remove('on');
  const vue = Vues[App.route]; const c = $('#contenu');
  c.innerHTML = '<div class="grille g4">' + '<div class="carte"><div class="sq" style="height:70px"></div></div>'.repeat(4) + '</div><div class="carte" style="margin-top:16px"><div class="sq" style="height:260px"></div></div>';
  try { await vue(c); } catch (e) { if (e.code === 'session') return; c.innerHTML = `<div class="bandeau erreur">${I.alert}<div><strong>Impossible de charger cette page.</strong> ${esc(e.message)}${App.mode === 'reel' ? ' Vérifiez la connexion au serveur.' : ''}</div></div>`; console.error(e); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);

/* ── Alertes du parc (pastille du menu) ── */
async function majAlertes() {
  try {
    const f = await api('/api/flotte'); App.flotte = f;
    App.alertes = f.bornes.reduce((n, b) => n + b.alertes.filter(a => a.niveau === 'critique' || a.niveau === 'attention').length, 0);
    $('#cloche .point').hidden = !App.alertes;
    $$('#nav a[data-r="admin/bornes"]').forEach(a => { let c = $('.compteur', a); if (App.alertes) { if (!c) { c = document.createElement('span'); c.className = 'compteur'; a.appendChild(c); } c.textContent = App.alertes; } else if (c) c.remove(); });
  } catch (_) {}
}

/* ── Connexion ── */
function majMode() {
  const reel = App.mode === 'reel';
  $('#puceMode').className = 'puce ' + (reel ? 'bon' : 'attention');
  $('#puceMode').innerHTML = reel ? `${I.check} Connecté · ${esc(new URL(App.url).host)}` : `${I.info} Démonstration`;
  $('#bandeauDemo').hidden = reel; $('#btnConnexion').textContent = reel ? 'Déconnecter' : 'Se connecter';
  $('#btnConnexion').hidden = !reel && !adresseServeur();
}
function deconnecter(msg) {
  App.session.del('noa-jeton'); App.mode = 'demo'; App.jeton = ''; clearInterval(App.timer); majMode(); Demo.init(); libererPhotos(); router(); majAlertes();
  if (msg) { $('#erreurConnexion').textContent = msg; $('#dlgConnexion').showModal(); }
}
function lancerRafraichissement() { clearInterval(App.timer); App.timer = setInterval(() => { majAlertes(); if (!panneau.onFermer && !document.hidden && /apercu|bornes|commandes/.test(App.route) && !$('#panneau').classList.contains('on')) router(); }, 45000); }

/* Le serveur est connu d'avance : celui qui sert la page, sinon config.js. Personne n'a d'adresse à saisir. */
function adresseServeur() {
  const c = String(window.NOA_SERVEUR || '').trim().replace(/\/$/, '');
  return App.siteServeur ? location.origin : (/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1))/.test(c) ? c : '');
}
$('#btnConnexion').addEventListener('click', () => {
  if (App.mode === 'reel') return deconnecter();
  $('#champMdp').value = ''; $('#erreurConnexion').textContent = ''; $('#dlgConnexion').showModal(); $('#champMdp').focus();
});
$('#btnAnnulerConnexion').addEventListener('click', () => $('#dlgConnexion').close());
$('#formConnexion').addEventListener('submit', async e => {
  e.preventDefault();
  const url = adresseServeur(), err = $('#erreurConnexion'); err.textContent = 'Connexion…';
  try {
    if (!url) throw new Error("Aucun serveur configuré (voir config.js).");
    const r = await fetch(url + '/api/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motdepasse: $('#champMdp').value }) });
    if (r.status === 401) throw new Error('Mot de passe refusé.');
    if (r.status === 429) throw new Error("Trop d'essais : réessayez dans quelques minutes.");
    const j = await r.json(); if (!j.jeton) throw new Error('Réponse inattendue du serveur.');
    App.mode = 'reel'; App.url = url; App.jeton = j.jeton; App.stock.set('noa-url', url); App.session.set('noa-jeton', j.jeton);
    $('#champMdp').value = ''; $('#dlgConnexion').close(); majMode(); libererPhotos(); await router(); majAlertes(); lancerRafraichissement();
  } catch (x) { err.textContent = x.name === 'TypeError' ? "Serveur injoignable (adresse, réseau, ou origine non autorisée côté serveur)." : x.message; }
});

/* ── Thème, menu mobile, recherche globale ── */
(function () {
  const t = App.stock.get('noa-theme'); if (t) document.documentElement.dataset.theme = t;
  $('#btnTheme').addEventListener('click', () => { const a = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), n = a === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; App.stock.set('noa-theme', n); router(); });
  $('#btnMenu').addEventListener('click', () => $('#lateral').classList.toggle('on'));
  $$('.espaces button').forEach(b => b.addEventListener('click', () => changerEspace(b.dataset.espace)));
  $('#panneauFond').addEventListener('click', () => panneau.fermer());
  $('#lightbox').addEventListener('click', () => $('#lightbox').classList.remove('on'));
  $('#cloche').addEventListener('click', () => { App.espace = 'admin'; location.hash = '#/admin/bornes'; });
  $('#rechercheGlobale').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) { App.espace = 'opticien'; App.filtres = { ...(App.filtres || {}), q: e.target.value.trim(), etat: '' }; location.hash = '#/opticien/dossiers'; if (App.route === 'opticien/dossiers') router(); e.target.value = ''; } });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#rechercheGlobale').focus(); } });
})();

/* ── Hébergé par le serveur N.O.A lui-même ? ──
   Dans ce cas la page et l'API ont la même origine : pas d'adresse à saisir, et
   on demande le mot de passe d'emblée au lieu d'ouvrir la démonstration. */
async function detecterServeur() {
  if (/github\.io$/.test(location.hostname)) return;        // GitHub Pages : démonstration, aucun serveur à interroger
  if (!/\/tableau-de-bord\/?$/.test(location.pathname) && !/\/tableau-de-bord\//.test(location.pathname)) return;
  try {
    const r = await fetch('/sante', { cache: 'no-store' }); const j = await r.json();
    if (!(r.ok && j.ok)) return;
    App.siteServeur = true; App.stock.set('noa-url', location.origin);
    if (App.mode === 'reel') { App.url = location.origin; return; }
    majMode(); $('#bandeauDemo').hidden = true; $('#dlgConnexion').showModal(); $('#champMdp').focus();
  } catch (_) { /* hébergé ailleurs (GitHub Pages, poste local) : démonstration */ }
}

/* ── Démarrage ── */
(function () {
  App.espace = App.stock.get('noa-espace') || 'admin';
  const url = App.stock.get('noa-url'), jeton = App.session.get('noa-jeton');
  if (jeton && url) { App.mode = 'reel'; App.url = url; App.jeton = jeton; lancerRafraichissement(); }
  majMode(); router(); majAlertes(); detecterServeur();
  if (App.mode !== 'reel' && adresseServeur() && !App.siteServeur) { $('#bandeauDemo').hidden = true; $('#dlgConnexion').showModal(); }
})();
