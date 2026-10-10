/* N.O.A — Pilotage · les pages. Espace opticien : commandes, dossiers patients.
   Espace administration : vue d'ensemble, ventes, bornes, qualité, réglages, journal. */
'use strict';
const Vues = {};

/* ═══════════ Éléments partagés ═══════════ */
const ETATS = ['recu', 'en_fabrication', 'pret', 'livre'];
const LIB_ETAT = { recu: 'Reçue', en_fabrication: 'En fabrication', pret: 'Prête', livre: 'Livrée' };
const IC_ETAT = { recu: 'tag', en_fabrication: 'tool', pret: 'check', livre: 'store' };
const puceEtat = e => `<span class="puce ${e === 'livre' ? 'bon' : e === 'pret' ? 'info' : e === 'recu' ? '' : 'attention'}">${I[IC_ETAT[e]] || ''}${esc(LIB_ETAT[e] || e)}</span>`;
const LIB_STATUT = { en_ligne: ['En ligne', 'bon', 'check'], retard: ['En retard', 'attention', 'alert'], hors_ligne: ['Hors ligne', 'critique', 'x'] };
const puceStatut = s => { const [l, c, i] = LIB_STATUT[s] || ['?', '', 'info']; return `<span class="puce ${c}">${I[i]}${l}</span>`; };
const LIB_CAMERA = { ok: 'En service', inactive: 'Branchée', perdue: 'Perdue', absente: 'Absente' };
const joursRetard = d => d.etat === 'livre' ? 0 : Math.floor((Date.now() - parse(d.recu_le).getTime()) / 864e5);
const estExpress = d => /express/i.test(d.extras || '');
const prenom = n => String(n || '').split(/\s+/)[0];

function kpi({ lib, ic, val, unite, delta, detail, serie }) {
  let d = '';
  if (delta !== undefined && delta !== null) {
    const hausse = delta > 0.005, baisse = delta < -0.005;
    d = `<span class="delta ${hausse ? 'hausse' : baisse ? 'baisse' : 'stable'}">${hausse ? I.up : baisse ? I.down : ''}${hausse ? '+' : ''}${(delta * 100).toFixed(0).replace('.', ',')} %<span class="sous" style="font-weight:500"> vs période préc.</span></span>`;
  } else if (delta === null) d = '<span class="delta stable">Pas de période précédente</span>';
  return `<div class="carte kpi"><div class="lib">${I[ic] || ''}${esc(lib)}</div><div class="val">${val}${unite ? `<small>${esc(unite)}</small>` : ''}</div>${d}${detail ? `<div class="detail">${detail}</div>` : ''}${serie ? Graph.trace(serie) : ''}</div>`;
};
const variation = (cur, prev) => prev > 0 ? (cur - prev) / prev : (cur > 0 ? null : 0);
const selectPeriode = () => `<div class="segments" role="group" aria-label="Période">${[7, 30, 90].map(j => `<button type="button" data-periode="${j}" aria-pressed="${App.periode === j}">${j} j</button>`).join('')}</div>`;
function brancherPeriode(c, recharger) { $$('[data-periode]', c).forEach(b => b.addEventListener('click', () => { App.periode = +b.dataset.periode; recharger(); })); }
function telecharger(nom, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const dossierQs = f => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(f)) if (v !== '' && v != null) p.set(k, v); return p.toString(); };

/* ═══════════ ESPACE OPTICIEN ═══════════ */
function fiche(d) {
  const r = joursRetard(d), suivant = ETATS[ETATS.indexOf(d.etat) + 1];
  return `<article class="fiche ${r > 5 ? 'retard' : estExpress(d) && d.etat !== 'livre' ? 'urgente' : ''}" data-id="${esc(d.id)}" tabindex="0" role="button" aria-label="Ouvrir le dossier de ${esc(d.nom)}">
    <div class="l1"><span class="avatar">${esc(initiales(d.nom))}</span><div style="min-width:0;flex:1"><div class="nom">${esc(d.nom)}</div><div class="tel chiffres">${esc(telAffiche(d.tel))}</div></div><span class="montant chiffres">${fcfa(d.montant)}</span></div>
    <div class="l3"><span>${I.glasses.replace('<svg', '<svg width="14" height="14"')}</span><span>${esc(d.monture || '—')}</span>${estExpress(d) ? `<span class="puce attention">${I.clock}Express</span>` : ''}${r > 5 ? `<span class="puce critique">${I.alert}${r} j</span>` : ''}</div>
    <div class="l3"><span>${esc(d.boutique || '')}</span><span>·</span><span>${esc(depuis(d.recu_le))}</span></div>
    ${suivant ? `<button class="btn petit avancer" type="button" data-avancer="${esc(d.id)}" data-vers="${suivant}">${I.arrow}${esc(LIB_ETAT[suivant])}</button>` : ''}</article>`;
}
async function avancer(id, vers) {
  try { await api(`/api/dossiers/${encodeURIComponent(id)}/etat`, { method: 'POST', body: { etat: vers } }); toast(`Dossier ${id} : ${LIB_ETAT[vers].toLowerCase()}`); return true; }
  catch (e) { toast('Échec : ' + e.message, true); return false; }
}

Vues['opticien/commandes'] = async c => {
  const f = App.filtres = App.filtres || {}; f.vue = f.vue || 'tableau';
  const r = await api('/api/dossiers?limite=200'); let tous = r.dossiers;
  App.aTraiter = tous.filter(d => d.etat !== 'livre').length; dessinerMenu();
  const boutiques = [...new Set(tous.map(d => d.boutique).filter(Boolean))].sort();
  const filtre = d => (!f.boutique || d.boutique === f.boutique) && (!f.express || estExpress(d)) && (!f.cq || [d.nom, d.tel, d.id, d.monture].some(x => String(x).toLowerCase().includes(f.cq.toLowerCase())));
  const vus = tous.filter(filtre), semaine = Date.now() - 7 * 864e5;
  const col = e => vus.filter(d => d.etat === e && (e !== 'livre' || parse(d.livre_le || d.maj_le).getTime() >= semaine)).sort((a, b) => (estExpress(b) - estExpress(a)) || (parse(a.recu_le) - parse(b.recu_le)));
  const nRetard = vus.filter(d => joursRetard(d) > 5).length;
  const resume = ETATS.slice(0, 3).map(e => `<span class="puce">${esc(LIB_ETAT[e])} <b class="chiffres">${vus.filter(d => d.etat === e).length}</b></span>`).join(' ') + (nRetard ? ` <span class="puce critique">${I.alert}${nRetard} en retard (> 5 j)</span>` : '');
  c.innerHTML = `<div class="filtres"><label class="champ" style="min-width:230px">Rechercher<input type="search" id="cq" placeholder="Nom, téléphone, monture…" value="${esc(f.cq || '')}"></label>
    <label class="champ">Boutique<select id="cb"><option value="">Toutes</option>${boutiques.map(b => `<option ${f.boutique === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
    <label class="jours" style="align-self:end"><span style="display:contents"><input type="checkbox" id="ce" ${f.express ? 'checked' : ''}><span class="sr">Express seulement</span></span><span style="padding:5px 10px;border:1px solid var(--trait-fort);border-radius:8px;font-size:.84rem;font-weight:600;cursor:pointer;${f.express ? 'background:var(--marque);color:#fff;border-color:var(--marque)' : ''}">Express seulement</span></label>
    <span class="espace"></span><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${resume}</div>
    <div class="segments" role="group" aria-label="Affichage"><button type="button" data-vue="tableau" aria-pressed="${f.vue === 'tableau'}">Tableau</button><button type="button" data-vue="liste" aria-pressed="${f.vue === 'liste'}">Liste</button></div></div>
    ${f.vue === 'tableau' ? `<div class="kanban">${ETATS.map(e => { const l = col(e); return `<section class="colonne" aria-label="${esc(LIB_ETAT[e])}"><header>${I[IC_ETAT[e]]}<h3>${esc(LIB_ETAT[e])}${e === 'livre' ? ' <span class="sous">(7 j)</span>' : ''}</h3><span class="n chiffres">${l.length}</span></header>${l.length ? l.map(fiche).join('') : '<div class="vide" style="padding:18px 6px">Rien ici.</div>'}</section>`; }).join('')}</div>`
    : `<div class="carte defile" style="padding:6px 8px">${tableDossiers(vus.sort((a, b) => parse(b.recu_le) - parse(a.recu_le)))}</div>`}`;
  const rev = () => Vues['opticien/commandes'](c);
  $('#cq', c).addEventListener('input', e => { f.cq = e.target.value; clearTimeout(rev.t); rev.t = setTimeout(async () => { const pos = e.target.selectionStart; await rev(); const n = $('#cq', c); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
  $('#cb', c).addEventListener('change', e => { f.boutique = e.target.value; rev(); }); $('#ce', c).addEventListener('change', e => { f.express = e.target.checked; rev(); });
  $$('[data-vue]', c).forEach(b => b.addEventListener('click', () => { f.vue = b.dataset.vue; rev(); }));
  branchementDossiers(c, rev);
};
function branchementDossiers(c, recharger) {
  $$('[data-id]', c).forEach(el => { const ouvrir = () => ouvrirDossier(el.dataset.id, recharger); el.addEventListener('click', e => { if (e.target.closest('[data-avancer]')) return; ouvrir(); }); el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('button')) ouvrir(); }); });
  $$('[data-avancer]', c).forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); b.disabled = true; if (await avancer(b.dataset.avancer, b.dataset.vers)) recharger(); else b.disabled = false; }));
}
function tableDossiers(l) {
  if (!l.length) return '<div class="vide"><strong>Aucun dossier.</strong>Aucune commande ne correspond à ces critères.</div>';
  return `<table class="tab"><thead><tr><th>Patient</th><th>Monture</th><th class="num">Montant</th><th>Paiement</th><th>État</th><th>Reçue</th><th>Boutique</th></tr></thead><tbody>${l.map(d => `<tr class="cliquable" data-id="${esc(d.id)}" tabindex="0">
    <td><div class="identite"><span class="avatar">${esc(initiales(d.nom))}</span><div><strong>${esc(d.nom)}</strong><div class="sous chiffres">${esc(telAffiche(d.tel))} · ${esc(d.id)}</div></div></div></td>
    <td>${esc(d.monture || '—')}${estExpress(d) ? ` <span class="puce attention">Express</span>` : ''}</td><td class="num chiffres">${fcfa(d.montant)}</td><td>${esc(d.paiement || '—')}</td><td>${puceEtat(d.etat)}${joursRetard(d) > 5 ? ` <span class="puce critique">${joursRetard(d)} j</span>` : ''}</td>
    <td class="sous">${esc(depuis(d.recu_le))}</td><td>${esc(d.boutique || '—')}<div class="sous">${esc(d.borne || '')}</div></td></tr>`).join('')}</tbody></table>`;
}

Vues['opticien/dossiers'] = async c => {
  const f = App.filtres = App.filtres || {}; f.page = f.page || 0; const LIM = 25;
  const base = { q: f.q, etat: f.etat, boutique: f.boutique, du: f.du, au: f.au };
  const r = await api('/api/dossiers?' + dossierQs({ ...base, limite: LIM, decalage: f.page * LIM }));
  const boutiques = App.flotte ? [...new Set(App.flotte.bornes.map(b => b.boutique).filter(Boolean))].sort() : [];
  c.innerHTML = `<div class="filtres"><label class="champ" style="min-width:240px">Rechercher<input type="search" id="fq" placeholder="Nom, téléphone, n° de dossier, monture…" value="${esc(f.q || '')}"></label>
    <label class="champ">État<select id="fe"><option value="">Tous</option>${ETATS.map(e => `<option value="${e}" ${f.etat === e ? 'selected' : ''}>${LIB_ETAT[e]}</option>`).join('')}</select></label>
    <label class="champ">Boutique<select id="fb"><option value="">Toutes</option>${boutiques.map(b => `<option ${f.boutique === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
    <label class="champ">Du<input type="date" id="fdu" value="${esc(f.du || '')}"></label><label class="champ">Au<input type="date" id="fau" value="${esc(f.au || '')}"></label>
    <span class="espace"></span><button class="btn" id="fcsv" type="button">${I.download}Exporter en CSV</button></div>
    <div class="carte defile" style="padding:6px 8px">${tableDossiers(r.dossiers)}
    <div class="pagination"><span>${r.total ? `${f.page * LIM + 1}–${Math.min(r.total, (f.page + 1) * LIM)} sur ${nf(r.total)} dossier${r.total > 1 ? 's' : ''}` : ''}</span><span><button class="btn petit" id="fprec" ${f.page ? '' : 'disabled'}>Précédent</button> <button class="btn petit" id="fsuiv" ${(f.page + 1) * LIM < r.total ? '' : 'disabled'}>Suivant</button></span></div></div>`;
  const rev = () => Vues['opticien/dossiers'](c);
  $('#fq', c).addEventListener('input', e => { f.q = e.target.value; f.page = 0; clearTimeout(rev.t); rev.t = setTimeout(async () => { const pos = e.target.selectionStart; await rev(); const n = $('#fq', c); n.focus(); n.setSelectionRange(pos, pos); }, 280); });
  [['fe', 'etat'], ['fb', 'boutique'], ['fdu', 'du'], ['fau', 'au']].forEach(([id, k]) => $('#' + id, c).addEventListener('change', e => { f[k] = e.target.value; f.page = 0; rev(); }));
  $('#fprec', c).addEventListener('click', () => { f.page--; rev(); }); $('#fsuiv', c).addEventListener('click', () => { f.page++; rev(); });
  $('#fcsv', c).addEventListener('click', async () => {
    try { const r2 = await api('/api/dossiers.csv?' + dossierQs(base), { brut: true }); const blob = App.mode === 'demo' ? new Blob([r2.texte], { type: 'text/csv' }) : await r2.blob(); telecharger('noa-dossiers.csv', blob); toast('Export prêt.'); }
    catch (e) { toast('Export impossible : ' + e.message, true); }
  });
  branchementDossiers(c, rev);
};

/* ── Fiche patient ── */
const LIB_JOURNAL = { recu: ['Commande reçue', 'Dossier transmis par la borne'], renvoi: ['Dossier renvoyé par la borne', ''], purge: ['Photos effacées', ''] };
async function ouvrirDossier(id, apres) {
  let det; try { det = await api(`/api/dossiers/${encodeURIComponent(id)}`); } catch (e) { return toast('Dossier introuvable : ' + e.message, true); }
  const d = det.dossier, idx = ETATS.indexOf(d.etat), suivant = ETATS[idx + 1], r = joursRetard(d);
  const msgs = { recu: `Bonjour ${prenom(d.nom)}, nous avons bien reçu votre commande N.O.A (dossier ${d.id}). Nous revenons vers vous dès que vos lunettes sont prêtes.`,
    en_fabrication: `Bonjour ${prenom(d.nom)}, vos lunettes N.O.A (dossier ${d.id}) sont en cours de fabrication.`,
    pret: `Bonjour ${prenom(d.nom)}, vos lunettes N.O.A sont prêtes ! Vous pouvez passer les récupérer${d.boutique ? ' à la boutique ' + d.boutique : ''} (dossier ${d.id}).`,
    livre: `Bonjour ${prenom(d.nom)}, merci pour votre confiance. N'hésitez pas à nous contacter pour tout ajustement de vos lunettes N.O.A.` };
  const histo = [...det.journal.map(j => ({ quand: j.quand, texte: j.action === 'etat' ? 'Passée à « ' + (LIB_ETAT[j.detail] || j.detail) + ' »' : (LIB_JOURNAL[j.action] || [j.action])[0], note: false })), ...det.notes.map(n => ({ quand: n.quand, texte: n.texte, note: true }))].sort((a, b) => parse(a.quand) - parse(b.quand));
  const lien = (txt) => 'https://wa.me/' + telWhatsapp(d.tel) + '?text=' + encodeURIComponent(txt);
  panneau.ouvrir(`<header><span class="avatar" style="width:46px;height:46px;font-size:1rem">${esc(initiales(d.nom))}</span><div class="titre"><h2>${esc(d.nom)}</h2><div class="sous">Dossier <b class="chiffres">${esc(d.id)}</b> · reçu ${esc(depuis(d.recu_le))}</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${puceEtat(d.etat)}${estExpress(d) ? `<span class="puce attention">${I.clock}Express 48 h</span>` : ''}${r > 5 ? `<span class="puce critique">${I.alert}${r} jours</span>` : ''}</div></div><button class="icone-btn fermer-panneau" aria-label="Fermer">${I.x}</button></header>
  <div class="corps">
   <div class="bloc"><div class="etapes" role="list">${ETATS.map((e, i) => `<div role="listitem" class="etape ${i < idx ? 'fait' : i === idx ? 'courante' : ''}">${esc(LIB_ETAT[e])}</div>`).join('')}</div>
     <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${suivant ? `<button class="btn principal" id="dAvancer">${I.arrow}Passer à « ${esc(LIB_ETAT[suivant])} »</button>` : '<span class="puce bon">' + I.check + 'Commande terminée</span>'}
     <label class="sr" for="dEtat">Définir l'état</label><select id="dEtat">${ETATS.map(e => `<option value="${e}" ${e === d.etat ? 'selected' : ''}>${LIB_ETAT[e]}</option>`).join('')}</select><button class="btn" id="dEtatOk">Appliquer</button></div></div>
   <div class="bloc"><h4>Contact</h4><dl class="liste-def"><dt>Téléphone</dt><dd class="chiffres" style="font-size:1.05rem">${esc(telAffiche(d.tel))}</dd></dl>
     <div class="actions-contact"><a class="btn" href="tel:+${telWhatsapp(d.tel)}">${I.phone}Appeler</a><a class="btn" id="dWa" href="${esc(lien(msgs[d.etat]))}" target="_blank" rel="noopener">${I.chat}WhatsApp</a><button class="btn" id="dCopier">${I.copy}Copier le numéro</button></div>
     <p class="sous" style="margin-top:8px">Le message WhatsApp est prérempli selon l'état de la commande ; il s'ouvre dans votre application, rien n'est envoyé sans vous.</p></div>
   <div class="bloc"><h4>Commande</h4><dl class="liste-def"><dt>Monture</dt><dd>${esc(d.monture || '—')}</dd><dt>Options</dt><dd>${esc(d.extras || 'Aucune')}</dd><dt>Montant</dt><dd class="chiffres">${fcfa(d.montant)}</dd><dt>Paiement</dt><dd>${esc(d.paiement || '—')}</dd><dt>Boutique</dt><dd>${esc(d.boutique || '—')}${d.borne ? ` <span class="sous">· borne ${esc(d.borne)}</span>` : ''}</dd><dt>Date</dt><dd>${esc(dateHeure(d.recu_le))}</dd></dl></div>
   <div class="bloc"><h4>Mesures prises à la borne</h4><dl class="liste-def"><dt>Écart pupillaire</dt><dd class="chiffres">${d.pd_mm != null ? dec(d.pd_mm, 1) + ' mm' : '—'}</dd><dt>Largeur de visage</dt><dd class="chiffres">${d.face_width_cm != null ? dec(d.face_width_cm, 1) + ' cm' : '—'}</dd><dt>Forme</dt><dd>${esc(d.face_shape || '—')}</dd></dl>
     <p class="sous" style="margin-top:6px">Mesure indicative : l'écart pupillaire destiné aux verres se confirme au comptoir.</p></div>
   <div class="bloc"><h4>Documents</h4><div class="photos"><figure class="photo" style="margin:0"><figcaption>${I.folder.replace('<svg', '<svg width="15" height="15"')}Ordonnance scannée<button class="btn petit" id="dtOrd" hidden>${I.download}</button></figcaption><div class="cadre" id="phOrd"><div class="absente">Chargement…</div></div></figure>
     <figure class="photo" style="margin:0"><figcaption>${I.glasses.replace('<svg', '<svg width="15" height="15"')}Portrait avec la monture<button class="btn petit" id="dtEss" hidden>${I.download}</button></figcaption><div class="cadre" id="phEss"><div class="absente">Chargement…</div></div></figure></div>
     <p class="sous" style="margin-top:8px">${d.purge_le ? 'Les photos ont été effacées après la livraison.' : 'Les photos sont effacées automatiquement quelques semaines après la livraison.'}</p></div>
   <div class="bloc"><h4>Consentement</h4><dl class="liste-def"><dt>Version</dt><dd>${esc(d.consentement || 'Non enregistré')}</dd><dt>Accepté le</dt><dd>${d.consentement_le ? esc(dateHeure(d.consentement_le)) : '—'}</dd></dl></div>
   <div class="bloc"><h4>Historique et notes</h4><ul class="chrono">${histo.map(h => `<li class="${h.note ? 'note' : ''}"><span class="quand">${esc(dateHeure(h.quand))}${h.note ? ' · note' : ''}</span>${esc(h.texte)}</li>`).join('')}</ul>
     <div class="note-form"><textarea id="dNote" maxlength="500" placeholder="Ajouter une note (ex. client rappelé, vient jeudi)…" aria-label="Nouvelle note"></textarea><button class="btn" id="dNoteOk">Ajouter</button></div></div>
  </div>`, { onFermer: () => { libererPhotos(); } });
  const p = $('#panneau');
  $('.fermer-panneau', p).addEventListener('click', () => panneau.fermer());
  const rechargerTout = async () => { panneau.fermer(); if (apres) await apres(); await ouvrirDossier(id, apres); };
  const dAv = $('#dAvancer', p); if (dAv) dAv.addEventListener('click', async () => { if (await avancer(id, suivant)) { if (apres) apres(); ouvrirDossier(id, apres); } });
  $('#dEtatOk', p).addEventListener('click', async () => { const v = $('#dEtat', p).value; if (v !== d.etat && await avancer(id, v)) { if (apres) apres(); ouvrirDossier(id, apres); } });
  $('#dCopier', p).addEventListener('click', () => { navigator.clipboard?.writeText(telNettoye(d.tel)).then(() => toast('Numéro copié.'), () => toast('Copie impossible.', true)); });
  $('#dNoteOk', p).addEventListener('click', async () => { const t = $('#dNote', p).value.trim(); if (!t) return; try { await api(`/api/dossiers/${encodeURIComponent(id)}/note`, { method: 'POST', body: { texte: t } }); toast('Note ajoutée.'); ouvrirDossier(id, apres); } catch (e) { toast('Échec : ' + e.message, true); } });
  for (const [nom, cadre, dl] of [['ordonnance', '#phOrd', '#dtOrd'], ['essai', '#phEss', '#dtEss']]) {
    const el = $(cadre, p);
    if (!d.photos.includes(nom)) { el.innerHTML = `<div class="absente">${d.purge_le ? 'Effacée après livraison' : 'Aucune image reçue'}</div>`; continue; }
    photo(id, nom).then(u => { if (!u) { el.innerHTML = '<div class="absente">Image indisponible</div>'; return; } el.innerHTML = `<img alt="${nom === 'ordonnance' ? 'Ordonnance scannée' : 'Portrait avec la monture'} de ${esc(d.nom)}" src="${u}">`; el.addEventListener('click', () => lightbox(u)); const b = $(dl, p); b.hidden = false; b.addEventListener('click', e => { e.stopPropagation(); fetch(u).then(r => r.blob()).then(bl => telecharger(`${d.id}-${nom}.jpg`, bl)); }); });
  }
}

/* ═══════════ ESPACE ADMINISTRATION ═══════════ */
const parJourSerie = (st, cle) => st.par_jour.map(p => p[cle]);
const jourCourt = s => parse(s + ' 12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

Vues['admin/apercu'] = async c => {
  const [st, fl, qual] = await Promise.all([api(`/api/ventes/stats?jours=${App.periode}`), api('/api/flotte'), api(`/api/mesures/stats?jours=${App.periode}`)]);
  App.flotte = fl; const bornes = fl.bornes, enLigne = bornes.filter(b => b.statut === 'en_ligne').length;
  const alertes = bornes.flatMap(b => b.alertes.filter(a => a.niveau !== 'info').map(a => ({ ...a, borne: b.nom }))).sort((a, b) => (a.niveau === 'critique' ? 0 : 1) - (b.niveau === 'critique' ? 0 : 1));
  const dc = variation(st.commandes, st.precedent.commandes), dca = variation(st.ca, st.precedent.ca);
  let metrique = App.metrique || 'ca';
  const courbe = () => Graph.courbe({ points: st.par_jour.map(p => ({ x: jourCourt(p.jour), y: p[metrique], n: p.n, ca: p.ca })), fmtY: v => metrique === 'ca' ? (v >= 1000 ? nf(v / 1000) + ' k' : nf(v)) : nf(v),
    titre: metrique === 'ca' ? "Chiffre d'affaires par jour" : 'Commandes par jour', libelle: p => `${p.x} : ${fcfa(p.ca)} · ${p.n} commande${p.n > 1 ? 's' : ''}` });
  c.innerHTML = `<div class="filtres">${selectPeriode()}<span class="espace"></span><span class="sous">Du ${esc(jourCourt(st.par_jour[0].jour))} au ${esc(jourCourt(st.par_jour[st.par_jour.length - 1].jour))}</span></div>
  <section class="grille g4" aria-label="Indicateurs">
    ${kpi({ lib: "Chiffre d'affaires", ic: 'euro', val: nf(st.ca), unite: 'FCFA', delta: dca, serie: parJourSerie(st, 'ca') })}
    ${kpi({ lib: 'Commandes', ic: 'folder', val: nf(st.commandes), delta: dc, detail: `${nf(st.etats.livre)} livrées au total`, serie: parJourSerie(st, 'n') })}
    ${kpi({ lib: 'Panier moyen', ic: 'tag', val: nf(st.panier_moyen), unite: 'FCFA', detail: `${pct(st.commandes ? st.avec_express / st.commandes : 0)} prennent l'option Express` })}
    ${kpi({ lib: 'Conversion', ic: 'eye', val: st.conversion == null ? '—' : pct(st.conversion, 1), detail: `${nf(st.essayages)} essayages → ${nf(st.commandes)} commandes` })}
  </section>
  <section class="grille g-2-1" style="margin-top:16px">
    <div class="carte graph" id="cCourbe"><div class="carte-tete"><h3>${metrique === 'ca' ? "Chiffre d'affaires" : 'Commandes'} par jour</h3><span class="droite"><div class="segments" role="group" aria-label="Indicateur"><button data-m="ca" aria-pressed="${metrique === 'ca'}">CA</button><button data-m="n" aria-pressed="${metrique === 'n'}">Commandes</button></div></span></div><div id="plCourbe"></div></div>
    <div class="carte"><div class="carte-tete"><h3>À surveiller</h3><span class="aide">${alertes.length || st.en_retard.length ? '' : 'Tout va bien'}</span></div>
      ${alertes.length || st.en_retard.length ? `<div>${st.en_retard.length ? `<a class="alerte-l critique" href="#/opticien/commandes" style="text-decoration:none">${I.alert}<span><b>${st.en_retard.length} commande${st.en_retard.length > 1 ? 's' : ''} en retard</b> (plus de 5 jours, non livrées)</span></a>` : ''}
      ${alertes.slice(0, 7).map(a => `<a class="alerte-l ${a.niveau}" href="#/admin/bornes" style="text-decoration:none">${a.niveau === 'critique' ? I.x : I.alert}<span><b>${esc(a.borne)}</b> — ${esc(a.texte)}</span></a>`).join('')}</div>` : `<div class="vide"><strong>Rien à signaler.</strong>Toutes les bornes répondent et aucune commande n'est en retard.</div>`}
      <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap"><span class="puce ${enLigne === bornes.length ? 'bon' : 'attention'}">${I.kiosk}${enLigne} / ${bornes.length} bornes en ligne</span>${st.delai_livraison_h != null ? `<span class="puce">${I.clock}Livraison en ${st.delai_livraison_h < 48 ? st.delai_livraison_h + ' h' : dec(st.delai_livraison_h / 24, 1) + ' j'} en moyenne</span>` : ''}</div></div>
  </section>
  <section class="grille g3" style="margin-top:16px">
    ${Graph.carte({ id: 'pay', titre: 'Moyens de paiement', sous: 'part du chiffre d’affaires', corps: Graph.empile(st.par_paiement.map(p => ({ nom: p.nom, valeur: p.ca })), fcfa), tableau: st.par_paiement.map(p => [p.nom, p.n, fcfa(p.ca)]), entetes: ['Moyen', 'Commandes', 'CA'] })}
    ${Graph.carte({ id: 'mont', titre: 'Montures les plus vendues', sous: 'par chiffre d’affaires', corps: Graph.barresH(st.par_monture.slice(0, 6).map(m => ({ nom: m.nom, valeur: m.ca, sous: m.n + ' vte' + (m.n > 1 ? 's' : '') })), fcfa), tableau: st.par_monture.map(m => [m.nom, m.n, fcfa(m.ca)]), entetes: ['Monture', 'Ventes', 'CA'] })}
    ${Graph.carte({ id: 'bout', titre: 'Boutiques', sous: 'par chiffre d’affaires', corps: Graph.barresH(st.par_boutique.map(m => ({ nom: m.nom, valeur: m.ca, sous: m.n + ' cmd' })), fcfa), tableau: st.par_boutique.map(m => [m.nom, m.n, fcfa(m.ca)]), entetes: ['Boutique', 'Commandes', 'CA'] })}
  </section>
  <section class="grille g2" style="margin-top:16px">
    <div class="carte"><div class="carte-tete"><h3>Du essayage à la commande</h3><span class="aide">sur la période</span></div>${entonnoir(st)}</div>
    <div class="carte"><div class="carte-tete"><h3>Parc de bornes</h3><a class="aide" href="#/admin/bornes">Tout voir →</a></div><div style="display:flex;flex-direction:column">${bornes.map(b => `<a href="#/admin/bornes" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--trait);text-decoration:none;color:inherit"><b style="flex:1">${esc(b.nom)}</b><span class="sous">${esc(b.boutique || '')}</span>${puceStatut(b.statut)}</a>`).join('')}</div></div>
  </section>`;
  const dessinerCourbe = () => { const cb = courbe(); $('#plCourbe', c).innerHTML = cb.html; cb.brancher($('#plCourbe', c)); };
  dessinerCourbe();
  $$('[data-m]', c).forEach(b => b.addEventListener('click', () => { App.metrique = b.dataset.m; Vues['admin/apercu'](c); }));
  brancherPeriode(c, () => Vues['admin/apercu'](c));
};
function entonnoir(st) {
  const e = [['Essayages à la borne', st.essayages, 1], ['Monture choisie', st.essayages_choisis, st.essayages ? st.essayages_choisis / st.essayages : 0], ['Commandes payées', st.commandes, st.essayages ? st.commandes / st.essayages : 0]];
  return `<div class="entonnoir">${e.map(([l, n, p]) => `<div class="etage"><span>${esc(l)}</span><div class="piste"><div class="remplie" style="width:${Math.max(2, Math.min(100, p * 100))}%"></div></div><b class="chiffres" style="text-align:right">${nf(n)}${p < 1 ? ` <span class="sous">${pct(p)}</span>` : ''}</b></div>`).join('')}</div>`;
}

Vues['admin/ventes'] = async c => {
  const f = App.fv = App.fv || {};
  const qs = dossierQs({ jours: App.periode, boutique: f.boutique, borne: f.borne });
  const [st, fl] = await Promise.all([api('/api/ventes/stats?' + qs), api('/api/flotte')]);
  const boutiques = [...new Set(fl.bornes.map(b => b.boutique).filter(Boolean))].sort(), bornes = fl.bornes.map(b => b.nom);
  const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const h = st.par_heure.slice(7, 21);
  c.innerHTML = `<div class="filtres">${selectPeriode()}<label class="champ">Boutique<select id="vb"><option value="">Toutes</option>${boutiques.map(b => `<option ${f.boutique === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label><label class="champ">Borne<select id="vr"><option value="">Toutes</option>${bornes.map(b => `<option ${f.borne === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label></div>
  <section class="grille g4">
    ${kpi({ lib: "Chiffre d'affaires", ic: 'euro', val: nf(st.ca), unite: 'FCFA', delta: variation(st.ca, st.precedent.ca), serie: parJourSerie(st, 'ca') })}
    ${kpi({ lib: 'Commandes', ic: 'folder', val: nf(st.commandes), delta: variation(st.commandes, st.precedent.commandes) })}
    ${kpi({ lib: 'Options Express', ic: 'clock', val: pct(st.commandes ? st.avec_express / st.commandes : 0), detail: `${nf(st.avec_express)} commandes · spray : ${nf(st.avec_spray)}` })}
    ${kpi({ lib: 'Délai de livraison', ic: 'tool', val: st.delai_livraison_h == null ? '—' : (st.delai_livraison_h < 48 ? st.delai_livraison_h : dec(st.delai_livraison_h / 24, 1)), unite: st.delai_livraison_h == null ? '' : (st.delai_livraison_h < 48 ? 'h' : 'jours'), detail: `${nf(st.livrees)} commandes livrées` })}
  </section>
  <section class="grille g-2-1" style="margin-top:16px"><div class="carte graph"><div class="carte-tete"><h3>Chiffre d'affaires par jour</h3></div><div id="vCourbe"></div></div>
    <div class="carte"><div class="carte-tete"><h3>Où en sont les commandes</h3></div>${Graph.barresH(ETATS.map(e => ({ nom: LIB_ETAT[e], valeur: st.etats[e] })), nf)}</div></section>
  <section class="grille g3" style="margin-top:16px">
    ${Graph.carte({ id: 'heure', titre: 'Commandes selon l’heure', sous: 'quand les clients paient', corps: Graph.colonnes({ donnees: h, valeur: d => d.n, etiqX: d => d.heure % 2 ? null : d.heure + ' h', etiqColonne: d => `${d.heure} h : ${d.n} commande${d.n > 1 ? 's' : ''}`, titre: 'Commandes par heure' }), tableau: h.map(d => [d.heure + ' h', d.n]), entetes: ['Heure', 'Commandes'] })}
    ${Graph.carte({ id: 'sem', titre: 'Commandes selon le jour', sous: 'rythme de la semaine', corps: Graph.colonnes({ donnees: st.par_semaine, valeur: d => d.n, etiqX: d => jours[d.jour], etiqColonne: d => `${jours[d.jour]} : ${d.n} commande${d.n > 1 ? 's' : ''}`, titre: 'Commandes par jour de semaine' }), tableau: st.par_semaine.map(d => [jours[d.jour], d.n]), entetes: ['Jour', 'Commandes'] })}
    ${Graph.carte({ id: 'forme', titre: 'Formes de visage', sous: 'des clients qui commandent', corps: Graph.barresH(st.par_forme.map(m => ({ nom: m.nom, valeur: m.n })), nf), tableau: st.par_forme.map(m => [m.nom, m.n]), entetes: ['Forme', 'Commandes'] })}
  </section>
  <section class="grille g2" style="margin-top:16px">
    <div class="carte"><div class="carte-tete"><h3>Par boutique</h3></div>${tableauGroupe(st.par_boutique, 'Boutique')}</div>
    <div class="carte"><div class="carte-tete"><h3>Par borne</h3></div>${tableauGroupe(st.par_borne, 'Borne')}</div></section>
  <section class="carte" style="margin-top:16px"><div class="carte-tete"><h3>Commandes en retard</h3><span class="aide">non livrées depuis plus de 5 jours</span></div>
    ${st.en_retard.length ? `<div class="defile"><table class="tab"><thead><tr><th>Patient</th><th>Monture</th><th>État</th><th class="num">Depuis</th></tr></thead><tbody>${st.en_retard.map(d => `<tr class="cliquable" data-id="${esc(d.id)}" tabindex="0"><td><strong>${esc(d.nom)}</strong><div class="sous">${esc(d.id)}</div></td><td>${esc(d.monture || '—')}</td><td>${puceEtat(d.etat)}</td><td class="num"><span class="puce critique">${d.jours} j</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="vide"><strong>Aucun retard.</strong>Toutes les commandes avancent.</div>'}</section>`;
  const cb = Graph.courbe({ points: st.par_jour.map(p => ({ x: jourCourt(p.jour), y: p.ca, n: p.n })), fmtY: v => v >= 1000 ? nf(v / 1000) + ' k' : nf(v), titre: "Chiffre d'affaires par jour", libelle: p => `${p.x} : ${fcfa(p.y)} · ${p.n} commande${p.n > 1 ? 's' : ''}` });
  $('#vCourbe', c).innerHTML = cb.html; cb.brancher($('#vCourbe', c));
  $('#vb', c).addEventListener('change', e => { f.boutique = e.target.value; Vues['admin/ventes'](c); }); $('#vr', c).addEventListener('change', e => { f.borne = e.target.value; Vues['admin/ventes'](c); });
  brancherPeriode(c, () => Vues['admin/ventes'](c)); branchementDossiers(c, () => Vues['admin/ventes'](c));
};
const tableauGroupe = (l, nom) => l.length ? `<div class="defile"><table class="tab"><thead><tr><th>${nom}</th><th class="num">Commandes</th><th class="num">CA</th><th class="num">Panier</th></tr></thead><tbody>${l.map(g => `<tr><td><strong>${esc(g.nom)}</strong></td><td class="num">${nf(g.n)}</td><td class="num">${fcfa(g.ca)}</td><td class="num">${fcfa(Math.round(g.ca / g.n))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vide">Aucune donnée.</div>';

/* ── Bornes ── */
Vues['admin/bornes'] = async c => {
  const [fl, cm] = await Promise.all([api('/api/flotte'), api('/api/commandes')]); App.flotte = fl; App.commandes = cm.commandes;
  const b = fl.bornes, en = b.filter(x => x.statut === 'en_ligne').length;
  c.innerHTML = `<div class="filtres"><span class="puce ${en === b.length ? 'bon' : 'attention'}">${I.kiosk}${en} / ${b.length} en ligne</span><span class="puce">${I.refresh}Mise à jour toutes les 45 s</span><span class="espace"></span>
    <button class="btn" id="bMaj">${I.cloud}Vérifier les mises à jour (toutes)</button></div>
  ${b.length ? `<div class="bornes-grille">${b.map(x => carteBorne(x)).join('')}</div>` : '<div class="carte vide"><strong>Aucune borne connectée.</strong>Une borne apparaît ici dès qu’elle donne son premier signe de vie (voir DEPLOIEMENT.md, section 16).</div>'}`;
  $$('.borne-carte', c).forEach(el => el.addEventListener('click', () => ouvrirBorne(el.dataset.borne))); $$('.borne-carte', c).forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') ouvrirBorne(el.dataset.borne); }));
  $('#bMaj', c).addEventListener('click', async () => { if (!await confirmer({ titre: 'Vérifier les mises à jour ?', texte: 'Chaque borne en ligne contrôlera s’il existe une nouvelle version. Rien n’est installé en journée : l’installation reste planifiée la nuit.', bouton: 'Vérifier' })) return; for (const x of b.filter(x => x.statut === 'en_ligne')) await api('/api/commande', { method: 'POST', body: { borne: x.nom, action: 'verifier_maj' } }); toast('Vérification demandée à ' + en + ' borne' + (en > 1 ? 's' : '') + '.'); });
};
function carteBorne(x) {
  const e = x.etat || {};
  return `<article class="carte borne-carte" data-borne="${esc(x.nom)}" tabindex="0" role="button" aria-label="Ouvrir ${esc(x.nom)}"><div class="l1"><span class="avatar">${I.kiosk.replace('<svg', '<svg width="18" height="18"')}</span><div style="flex:1;min-width:0"><h3>${esc(x.nom)}</h3><div class="sous">${esc(x.boutique || '')} · ${esc(silence(x.silence_s))}</div></div>${puceStatut(x.statut)}</div>
    <div class="mini-stats"><div><b>${esc(x.build || '—')}</b>version</div><div><b>${esc(LIB_CAMERA[e.camera] || '—')}</b>caméra</div><div><b>${e.memoire_mo == null ? '—' : nf(e.memoire_mo) + ' Mo'}</b>mémoire</div></div>
    <div>${x.alertes.length ? x.alertes.slice(0, 3).map(a => `<div class="alerte-l ${a.niveau}">${a.niveau === 'critique' ? I.x : a.niveau === 'info' ? I.info : I.alert}<span>${esc(a.texte)}</span></div>`).join('') : `<div class="alerte-l" style="color:var(--bon-texte)">${I.check}<span>Rien à signaler</span></div>`}${x.alertes.length > 3 ? `<div class="sous" style="margin-top:4px">+ ${x.alertes.length - 3} autre${x.alertes.length > 4 ? 's' : ''}</div>` : ''}</div></article>`;
}
const ORDRES = [['recharger', 'Recharger la page', 'refresh', "Le client en cours retrouve l'accueil.", false], ['redemarrer', "Redémarrer l'application", 'power', 'Une quinzaine de secondes.', true], ['verifier_maj', 'Vérifier les mises à jour', 'cloud', "Contrôle immédiat ; l'installation reste de nuit.", false], ['collecte_on', 'Activer la collecte de mesures', 'eye', 'Mesures anonymes, sans photo ni nom.', false], ['collecte_off', 'Couper la collecte de mesures', 'eye', '', false]];
async function envoyerOrdre(nom, action, lib) {
  if (!await confirmer({ titre: lib + ' ?', texte: `Envoyer cet ordre à ${nom}. Elle l'exécutera à son prochain signe de vie (au plus une minute).`, bouton: 'Envoyer', danger: action === 'redemarrer' })) return false;
  try { await api('/api/commande', { method: 'POST', body: { borne: nom, action } }); toast('Ordre envoyé à ' + nom + '.'); return true; } catch (e) { toast('Échec : ' + e.message, true); return false; }
}
async function ouvrirBorne(nom) {
  const fl = await api('/api/flotte'); App.flotte = fl; const x = fl.bornes.find(b => b.nom === nom); if (!x) return; const e = x.etat || {};
  const rg = await api('/api/reglages'); const sur = rg.bornes[nom] || {}, maint = (sur.maintenance && sur.maintenance.actif) || (!sur.maintenance && rg.global.maintenance && rg.global.maintenance.actif);
  const cmds = (App.commandes || []).filter(c => c.borne === nom).slice(0, 5);
  const up = e.uptime_s ? (e.uptime_s > 86400 ? Math.floor(e.uptime_s / 86400) + ' j ' + Math.floor(e.uptime_s % 86400 / 3600) + ' h' : Math.floor(e.uptime_s / 3600) + ' h ' + Math.floor(e.uptime_s % 3600 / 60) + ' min') : '—';
  panneau.ouvrir(`<header><span class="avatar" style="width:46px;height:46px">${I.kiosk.replace('<svg', '<svg width="22" height="22"')}</span><div class="titre"><h2>${esc(x.nom)}</h2><div class="sous">${esc(x.boutique || '')} · dernier signe ${esc(silence(x.silence_s))}</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${puceStatut(x.statut)}${maint ? `<span class="puce info">${I.tool}En maintenance</span>` : ''}${e.session ? '<span class="puce">Essayage en cours</span>' : ''}</div></div><button class="icone-btn fermer-panneau" aria-label="Fermer">${I.x}</button></header>
  <div class="corps">
   ${x.alertes.length ? `<div class="bloc"><h4>Alertes</h4>${x.alertes.map(a => `<div class="alerte-l ${a.niveau}">${a.niveau === 'critique' ? I.x : a.niveau === 'info' ? I.info : I.alert}<span>${esc(a.texte)}</span></div>`).join('')}</div>` : ''}
   <div class="bloc"><h4>État</h4><dl class="liste-def"><dt>Version</dt><dd>${esc(x.build || '—')} <span class="sous">(la plus récente : ${esc(fl.build_recent || '—')})</span></dd><dt>Caméra</dt><dd>${esc(LIB_CAMERA[e.camera] || '—')}${e.cameras != null ? ` <span class="sous">· ${e.cameras} détectée${e.cameras > 1 ? 's' : ''}</span>` : ''}</dd><dt>Mémoire</dt><dd class="chiffres">${e.memoire_mo == null ? '—' : nf(e.memoire_mo) + ' Mo'}</dd><dt>Envois en attente</dt><dd class="chiffres">${nf(e.file_attente)}</dd><dt>Allumée depuis</dt><dd>${esc(up)}</dd><dt>Mise à jour</dt><dd>${esc({ inactive: 'Non applicable (version portable ou développement)', a_jour: 'À jour', telechargement: 'Téléchargement en cours', prete: 'Prête (' + (e.maj_version || '') + '), installation cette nuit', erreur: 'En échec' }[e.maj] || '—')}</dd><dt>Réglages</dt><dd>${x.reglages_a_jour ? 'Appliqués' : '<span style="color:var(--attention-texte)">En attente d’application</span>'}${e.reglages_version != null ? ` <span class="sous">· v${e.reglages_version}</span>` : ''}</dd><dt>Collecte</dt><dd>${e.collecte ? 'Active' : 'Coupée'}</dd></dl></div>
   <div class="bloc"><h4>Maintenance</h4><p class="sous" style="margin-bottom:8px">Verrouille l'écran de cette borne avec un message pour les clients. Elle ne reçoit plus personne tant que la maintenance est active.</p><button class="btn ${maint ? 'principal' : ''}" id="pMaint">${I.tool}${maint ? 'Terminer la maintenance' : 'Passer en maintenance'}</button></div>
   <div class="bloc"><h4>Ordres à distance</h4><div class="ordres-liste" style="display:grid;gap:8px">${ORDRES.map(([a, l, ic, d]) => `<button class="btn" style="justify-content:flex-start;padding:10px 14px;text-align:left" data-ordre="${a}">${I[ic]}<span style="display:block"><b style="display:block;font-weight:650">${esc(l)}</b>${d ? `<span class="sous">${esc(d)}</span>` : ''}</span></button>`).join('')}</div></div>
   <div class="bloc"><h4>Réglages propres à cette borne</h4><a class="btn" href="#/admin/reglages" id="pReg">${I.sliders}Ouvrir les réglages</a></div>
   ${cmds.length ? `<div class="bloc"><h4>Derniers ordres</h4><ul class="chrono">${cmds.map(cm => `<li><span class="quand">${esc(dateHeure(cm.cree_le))}</span>${esc((ORDRES.find(o => o[0] === cm.action) || [0, cm.action])[1])} — ${cm.accusee_le ? `<span style="color:var(--bon-texte)">exécuté (${esc(cm.resultat || 'ok')})</span>` : cm.envoyee_le ? 'envoyé, en attente d’accusé' : 'en attente de la borne'}</li>`).join('')}</ul></div>` : ''}
  </div>`);
  const p = $('#panneau'); $('.fermer-panneau', p).addEventListener('click', () => panneau.fermer());
  $$('[data-ordre]', p).forEach(b => b.addEventListener('click', async () => { const o = ORDRES.find(o => o[0] === b.dataset.ordre); if (await envoyerOrdre(nom, o[0], o[1])) { const cm = await api('/api/commandes'); App.commandes = cm.commandes; } }));
  $('#pMaint', p).addEventListener('click', async () => {
    if (maint) { if (!await confirmer({ titre: 'Terminer la maintenance ?', texte: nom + ' reprend les clients.', bouton: 'Terminer' })) return; const n = { ...sur }; delete n.maintenance; if (!(rg.global.maintenance && rg.global.maintenance.actif)) { await api('/api/reglages', { method: 'POST', body: { portee: 'borne:' + nom, donnees: n } }); toast('Maintenance terminée sur ' + nom + '.'); ouvrirBorne(nom); } else { await api('/api/reglages', { method: 'POST', body: { portee: 'borne:' + nom, donnees: { ...n, maintenance: { actif: false, message: '' } } } }); toast('Maintenance terminée sur ' + nom + '.'); ouvrirBorne(nom); } return; }
    const msg = await demanderTexte({ titre: 'Passer ' + nom + ' en maintenance', texte: "Message affiché aux clients (facultatif).", defaut: 'Borne momentanément indisponible. Merci de vous adresser à un conseiller.' });
    if (msg === null) return; await api('/api/reglages', { method: 'POST', body: { portee: 'borne:' + nom, donnees: { ...sur, maintenance: { actif: true, message: msg } } } }); toast(nom + ' passera en maintenance à son prochain signe de vie.'); ouvrirBorne(nom);
  });
  $('#pReg', p).addEventListener('click', () => { App.rgPortee = 'borne:' + nom; });
}
function demanderTexte({ titre, texte, defaut = '' }) {
  return new Promise(res => { const d = $('#dlgTexte'); $('#dtTitre').textContent = titre; $('#dtTexte').textContent = texte; const i = $('#dtChamp'); i.value = defaut; d.returnValue = ''; $('#dtOk').onclick = () => { d.close(); res(i.value.trim()); }; $('#dtAnnuler').onclick = () => { d.close(); res(null); }; d.oncancel = () => res(null); d.showModal(); i.focus(); });
}

/* ── Qualité d'essayage ── */
Vues['admin/qualite'] = async c => {
  const [st, rg] = await Promise.all([api(`/api/mesures/stats?jours=${App.periode}`), api('/api/reglages')]);
  const suivi = (rg.global && rg.global.suivi) || {}, kmin = suivi.k_min ?? 0.85, kmax = suivi.k_max ?? 1.10;
  const hk = st.k.histogramme, de = (kmin - hk[0].de) / 0.025, a = (kmax - hk[0].de) / 0.025, hs = st.suivi.histogramme, hh = st.par_heure.filter(x => x.n > 0);
  const horsK = st.k.n ? (st.k.hors_plage_bas + st.k.hors_plage_haut) / st.k.n : 0, mal = st.par_heure.filter(h => h.n >= 5 && h.degrades / h.n > .3);
  const props = [];
  if (st.k.n >= 20 && horsK > 0.03) { const nmin = Math.max(0.7, Math.min(kmin, +(st.k.p5 - 0.02).toFixed(2))), nmax = Math.min(1.35, Math.max(kmax, +(st.k.p95 + 0.02).toFixed(2))); props.push({ titre: `Élargir la plage de largeur de tête à ${dec(nmin)}–${dec(nmax)}`, detail: `${pct(horsK, 1)} des clients sortent de la plage actuelle (${dec(kmin)}–${dec(kmax)}). Leurs branches seraient mal écartées.`, agir: { portee: 'global', suivi: { k_min: nmin, k_max: nmax } } }); }
  else if (st.k.n >= 20) props.push({ titre: 'Largeur de tête : plage à conserver', detail: `La plage ${dec(kmin)}–${dec(kmax)} couvre ${pct(1 - horsK, 1)} des clients.` });
  else props.push({ titre: 'Largeur de tête : pas assez de mesures', detail: `${nf(st.k.n)} mesure(s). Il en faut au moins 20 pour proposer un réglage.` });
  if (mal.length) props.push({ titre: `Suivi dégradé à ${mal.map(h => h.heure + ' h').join(', ')}`, detail: `Plus de 30 % des essayages y perdent le visage. La lumière de la boutique baisse : l'exposition de la caméra est le chantier à ouvrir (non réglable à distance pour l'instant).` });
  if (st.n && st.degrades / st.n > 0.1) props.push({ titre: `${pct(st.degrades / st.n)} d'essayages dégradés`, detail: 'Au-dessus des 10 % acceptables. Regardez les bornes concernées : caméra, éclairage, position.' });
  c.innerHTML = `<div class="filtres">${selectPeriode()}<span class="espace"></span><span class="puce">${I.eye}${nf(st.n)} essayages mesurés</span></div>
  <section class="grille g4">
    ${kpi({ lib: 'Suivi qui tient', ic: 'eye', val: pct(st.suivi.med), detail: 'part médiane du temps avec le visage suivi' })}
    ${kpi({ lib: 'Essayages dégradés', ic: 'alert', val: st.n ? pct(st.degrades / st.n) : '—', detail: 'suivi < 85 % ou monture disparue 2 fois' })}
    ${kpi({ lib: 'Têtes hors plage', ic: 'user', val: st.k.n ? pct(horsK, 1) : '—', detail: `plage de réglage ${dec(kmin)}–${dec(kmax)}` })}
    ${kpi({ lib: 'Écart pupillaire médian', ic: 'glasses', val: st.pd && st.pd.med ? dec(st.pd.med, 1) : '—', unite: 'mm', detail: 'mesuré par la borne (indicatif)' })}
  </section>
  <section class="grille g3" style="margin-top:16px">
    ${Graph.carte({ id: 'qk', titre: 'Largeur de tête mesurée', sous: `médiane ${dec(st.k.med)} · P5 ${dec(st.k.p5)} · P95 ${dec(st.k.p95)}`, corps: Graph.colonnes({ donnees: hk, valeur: d => d.n, bande: { de, a, texte: 'plage acceptée' }, etiqX: (d, i) => i % 4 === 0 ? dec(d.de) : null, etiqColonne: d => `${dec(d.de, 3)} à ${dec(d.de + .025, 3)} : ${nf(d.n)} essayage(s)`, titre: 'Largeur de tête' }), tableau: hk.map(d => [dec(d.de, 3), d.n]), entetes: ['Début de classe (K)', 'Essayages'] })}
    ${Graph.carte({ id: 'qs', titre: 'Part du temps où le suivi tient', sous: 'un essayage sain est à droite', corps: Graph.colonnes({ donnees: hs, valeur: d => d.n, etiqX: d => Math.round(d.de * 100) + '', etiqColonne: d => `${Math.round(d.de * 100)} à ${Math.round(d.de * 100 + 10)} % : ${nf(d.n)} essayage(s)`, titre: 'Suivi' }), tableau: hs.map(d => [Math.round(d.de * 100) + ' %', d.n]), entetes: ['À partir de', 'Essayages'] })}
    ${Graph.carte({ id: 'qh', titre: 'Dégradés selon l’heure', sous: 'où la lumière fait perdre le visage', corps: Graph.colonnes({ donnees: hh, valeur: d => d.n ? d.degrades / d.n * 100 : 0, fmtY: v => Math.round(v) + ' %', etiqX: d => d.heure + ' h', etiqColonne: d => `${d.heure} h : ${d.degrades} dégradé(s) sur ${d.n}`, titre: 'Dégradés par heure' }), tableau: hh.map(d => [d.heure + ' h', d.n, d.degrades]), entetes: ['Heure', 'Essayages', 'Dégradés'] })}
  </section>
  ${st.morpho ? `<section class="carte" style="margin-top:16px"><div class="carte-tete"><h3>Morphologies mesurées <span class="puce attention" style="margin-left:8px">expérimental</span></h3><span class="aide">${nf(st.morpho.n)} participant(s) · ${nf(st.morpho.exploitables)} avec une oreille exploitable · ${nf(st.morpho.validees)} mesuré(s) au mètre</span></div>
    ${st.morpho.n ? `<table class="tab"><thead><tr><th>Mesure</th><th>Participants</th><th>P5</th><th>Médiane</th><th>P95</th></tr></thead><tbody>${[['Largeur de visage (mm)', 'face_width_mm'], ['Largeur des tempes (mm)', 'temple_width_mm'], ['Hauteur du visage (mm)', 'face_height_mm'], ['Largeur du nez (mm)', 'nose_width_mm'], ['Asymétrie (%)', 'asym_pct'], ['Œil → oreille, droite (mm, estimation)', 'ear_depth_estimated_right'], ['Œil → oreille, gauche (mm, estimation)', 'ear_depth_estimated_left'], ['Confiance oreille droite (0 à 1)', 'ear_depth_confidence_right'], ['Confiance oreille gauche (0 à 1)', 'ear_depth_confidence_left']].map(([l, k]) => { const x = st.morpho[k] || { n: 0 }; return `<tr><td>${l}</td><td>${nf(x.n)}</td><td>${x.p5 == null ? '—' : dec(x.p5, 1)}</td><td>${x.med == null ? '—' : dec(x.med, 1)}</td><td>${x.p95 == null ? '—' : dec(x.p95, 1)}</td></tr>`; }).join('')}</tbody></table>` : `<p class="sous">Aucune mesure encore. Lancez une borne avec <code>--collecte</code> : chaque participant qui accepte est mesuré, sans photo ni identité.</p>`}
    <p class="sous" style="margin:10px 0">Ces valeurs ne modifient <b>pas</b> l'essayage. La profondeur des oreilles ne servira aux branches qu'une fois validée au mètre (<code>outils/validation-oreille.js</code>).</p>
    <div class="actions-ligne" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <button class="btn" type="button" data-export="json">Exporter JSON</button><button class="btn" type="button" data-export="csv">Exporter CSV</button>
      <form id="formManuelle" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-left:auto">
        <label class="champ">Participant<input id="mmPart" maxlength="8" placeholder="a1b2c3d4" pattern="[a-f0-9]{8}" required style="width:110px"></label>
        <label class="champ">Droite (mm)<input id="mmD" type="number" min="30" max="200" step="0.5" style="width:90px"></label>
        <label class="champ">Gauche (mm)<input id="mmG" type="number" min="30" max="200" step="0.5" style="width:90px"></label>
        <button class="btn principal" type="submit">Enregistrer la mesure au mètre</button>
      </form>
    </div>
  </section>` : ''}
  <section class="carte" style="margin-top:16px"><div class="carte-tete"><h3>Ce que disent les mesures</h3><span class="aide">Rien ne s'applique sans votre accord.</span></div>
    ${props.map((p, i) => `<div class="proposition"><div class="txt"><b>${esc(p.titre)}</b><span>${esc(p.detail)}</span></div>${p.agir ? `<button class="btn principal" data-appliquer="${i}">Appliquer à toutes les bornes</button>` : ''}</div>`).join('')}</section>`;
  brancherPeriode(c, () => Vues['admin/qualite'](c));
  $$('[data-export]', c).forEach(b => b.addEventListener('click', async () => {
    try { const f = b.dataset.export, r2 = await api('/api/mesures/export?format=' + f, { brut: true }); const blob = App.mode === 'demo' ? new Blob([r2.texte || ''], { type: 'text/plain' }) : await r2.blob(); telecharger('noa-morphologie.' + f, blob); toast('Export prêt.'); }
    catch (e) { toast('Export impossible : ' + e.message, 'erreur'); }
  }));
  const fm = $('#formManuelle', c);
  if (fm) fm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = $('#mmD', c).value, g = $('#mmG', c).value;
    if (!d && !g) return toast('Saisissez au moins une des deux mesures.', 'erreur');
    try { await api('/api/mesures/manuelle', { method: 'POST', body: { participant: $('#mmPart', c).value.trim().toLowerCase(), ear_depth_measured_right: d || null, ear_depth_measured_left: g || null } }); toast('Mesure enregistrée.'); $('#mmD', c).value = ''; $('#mmG', c).value = ''; $('#mmPart', c).value = ''; Vues['admin/qualite'](c); }
    catch (x) { toast('Refusé : ' + (x.message || 'vérifiez l\'identifiant et les valeurs (30 à 200 mm)'), 'erreur'); }
  });
  $$('[data-appliquer]', c).forEach(b => b.addEventListener('click', async () => {
    const p = props[+b.dataset.appliquer].agir;
    if (!await confirmer({ titre: 'Appliquer ce réglage ?', html: `La plage de largeur de tête passera à <b>${dec(p.suivi.k_min)}–${dec(p.suivi.k_max)}</b> sur <b>toutes les bornes</b>, à leur prochain signe de vie. Vous pourrez revenir en arrière dans Réglages → Suivi.`, bouton: 'Appliquer' })) return;
    try { const g = { ...(rg.global || {}), suivi: { ...suivi, ...p.suivi } }; await api('/api/reglages', { method: 'POST', body: { portee: 'global', donnees: g } }); toast('Réglage envoyé aux bornes.'); Vues['admin/qualite'](c); } catch (e) { toast('Échec : ' + e.message, true); }
  }));
};

/* ── Journal ── */
const LIB_AUDIT = { reglages: 'Réglages modifiés', commande: 'Ordre envoyé à une borne', etat: 'État d’un dossier changé', note: 'Note ajoutée', export_csv: 'Export CSV' };
Vues['admin/journal'] = async c => {
  const r = await api('/api/audit?limite=150');
  c.innerHTML = `<div class="carte defile">${r.lignes.length ? `<table class="tab"><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Sur</th><th>Détail</th></tr></thead><tbody>${r.lignes.map(l => `<tr><td class="chiffres">${esc(dateHeure(l.quand))}</td><td>${esc(l.qui)}</td><td><strong>${esc(LIB_AUDIT[l.action] || l.action)}</strong></td><td>${esc(l.cible || '—')}</td><td class="sous">${esc(l.detail || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="vide"><strong>Journal vide.</strong>Les actions du tableau de bord apparaissent ici.</div>'}</div>
  <p class="sous" style="margin-top:10px">Pour l'instant, toutes les actions sont signées « atelier » : l'identité de chaque personne viendra avec les comptes.</p>`;
};
