/* N.O.A — Pilotage · page Réglages : ce qui est envoyé aux bornes.
   Deux portées : « toutes les bornes » (global) et une borne en particulier,
   qui ne contient que ce qu'elle change par rapport au global. Rien n'est
   envoyé avant « Enregistrer », et chaque enregistrement entre au journal. */
'use strict';
(() => {
  const ONGLETS = [['general', 'Général', 'sliders'], ['tarifs', 'Tarifs', 'euro'], ['paiements', 'Paiements', 'card'], ['catalogue', 'Catalogue', 'glasses'], ['horaires', 'Horaires', 'calendar'], ['maintenance', 'Maintenance', 'tool'], ['suivi', 'Suivi de la tête', 'eye'], ['maj', 'Mises à jour', 'cloud']];
  const DEFAUTS = { 'accueil.message': '', inactivite_s: 120, redemarrage: '04:00', 'prix.base': 25000, 'prix.express': 5000, 'prix.spray': 1000, 'paiements.wave': true, 'paiements.orange': true,
    'horaires.actif': false, 'horaires.debut': '08:00', 'horaires.fin': '20:00', 'maintenance.actif': false, 'maintenance.message': '', 'suivi.k_min': 0.85, 'suivi.k_max': 1.10, 'suivi.fondu_debut_cm': -6.0, 'suivi.fondu_fin_cm': -8.0, 'suivi.maintien_ms': 1200, 'mise_a_jour.autorisee': true };
  const lire = (o, chemin) => chemin.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const ecrire = (o, chemin, v) => { const ks = chemin.split('.'); let a = o; ks.slice(0, -1).forEach(k => { a[k] = (a[k] && typeof a[k] === 'object') ? a[k] : {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
  const effacer = (o, chemin) => { const ks = chemin.split('.'); let a = o; for (const k of ks.slice(0, -1)) { a = a && a[k]; if (!a) return; } delete a[ks[ks.length - 1]]; if (ks.length > 1) { const p = lire(o, ks.slice(0, -1).join('.')); if (p && !Object.keys(p).length) effacer(o, ks.slice(0, -1).join('.')); } };
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const egal = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
  const SECTION_DE = ch => ch.split('.')[0];
  const LIB_SECTION = { accueil: 'message d’accueil', inactivite_s: 'délai d’inactivité', redemarrage: 'redémarrage nocturne', prix: 'tarifs', paiements: 'paiements', catalogue: 'catalogue', horaires: 'horaires', maintenance: 'maintenance', suivi: 'suivi de la tête', mise_a_jour: 'mises à jour' };

  Vues['admin/reglages'] = async c => {
    const [rg, fl] = await Promise.all([api('/api/reglages'), api('/api/flotte')]); App.flotte = fl;
    const etat = App.rg = App.rg && App.rg.versionServeur === rg.version ? App.rg : { onglet: (App.rg && App.rg.onglet) || 'general', portee: App.rgPortee || (App.rg && App.rg.portee) || 'global' };
    App.rgPortee = null;
    etat.versionServeur = rg.version; etat.global = rg.global || {}; etat.bornes = rg.bornes || {};
    const charger = () => { etat.original = clone(etat.portee === 'global' ? etat.global : (etat.bornes[etat.portee.slice(6)] || {})); etat.draft = clone(etat.original); };
    if (!etat.original) charger();
    if (etat.portee !== 'global' && !fl.bornes.some(b => 'borne:' + b.nom === etat.portee)) { etat.portee = 'global'; charger(); }
    const sur = () => etat.portee !== 'global';
    const eff = ch => { const v = lire(etat.draft, ch); if (v !== undefined) return { v, herite: false }; if (sur()) { const g = lire(etat.global, ch); if (g !== undefined) return { v: g, herite: true }; } return { v: DEFAUTS[ch], herite: sur(), usine: true }; };
    const sale = () => !egal(etat.draft, etat.original);
    const nbCh = () => Object.keys(etat.draft).length;
    const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const marque = ch => { if (!sur()) return ''; const e = eff(ch); return e.herite ? `<span class="herite">${e.usine ? 'valeur d’usine' : 'hérité de « toutes les bornes »'}</span>` : `<span class="herite" style="color:var(--accent)">propre à cette borne · <a href="#" data-reset="${ch}">revenir à l'héritage</a></span>`; };
    const champ = (ch, lib, type, extra = '') => { const e = eff(ch); return `<label class="champ">${esc(lib)} ${marque(ch)}<input type="${type}" data-ch="${ch}" value="${esc(e.v ?? '')}" ${extra}></label>`; };
    const inter = (ch, lib, desc) => { const e = eff(ch); return `<div class="rg-ligne"><div class="txt"><b>${esc(lib)}</b><span>${esc(desc || '')}</span> ${marque(ch)}</div><label class="interrupteur"><input type="checkbox" data-ch="${ch}" ${e.v ? 'checked' : ''} aria-label="${esc(lib)}"><i></i></label></div>`; };

    const onglet = {
      general: () => `<div class="carte"><div class="carte-tete"><h3>Général</h3></div>
        <div class="rg-ligne"><div class="txt"><b>Message d'accueil</b><span>Une ligne affichée sur l'écran d'accueil de la borne : promotion, information. Laissez vide pour ne rien afficher.</span></div></div>${champ('accueil.message', 'Message (120 caractères)', 'text', 'maxlength="120" placeholder="Ex. Soldes -10 % ce week-end"')}
        <div class="rg-ligne" style="margin-top:6px"><div class="txt"><b>Inactivité</b><span>Après ce délai sans toucher l'écran, un compte à rebours de 30 secondes démarre, puis la borne revient à l'accueil.</span></div></div>${champ('inactivite_s', 'Délai en secondes (30 à 600)', 'number', 'min="30" max="600" step="10"')}
        <div class="rg-ligne" style="margin-top:6px"><div class="txt"><b>Redémarrage nocturne</b><span>Heure à laquelle l'application redémarre pour libérer la mémoire. C'est aussi dans cette demi-heure que s'installent les mises à jour.</span></div></div>${champ('redemarrage', 'Heure', 'time')}</div>`,
      tarifs: () => { const p = eff('prix.base').v, ex = eff('prix.express').v, sp = eff('prix.spray').v; return `<div class="carte"><div class="carte-tete"><h3>Tarifs</h3><span class="aide">en FCFA</span></div>
        <div class="champs-ligne">${champ('prix.base', 'Monture + verres', 'number', 'min="1000" max="2000000" step="500"')}${champ('prix.express', 'Option Express 48 h', 'number', 'min="0" max="500000" step="500"')}${champ('prix.spray', 'Spray nettoyant', 'number', 'min="0" max="500000" step="100"')}</div>
        <div class="bandeau info" style="margin:16px 0 0">${I.info}<div>Un client sans option paie <b>${fcfa(+p)}</b> ; avec Express et spray, <b>${fcfa(+p + +ex + +sp)}</b>. Le montant d'un paiement est calculé <b>sur la borne</b> à partir de ces prix : une page modifiée ne peut pas payer moins.</div></div></div>`; },
      paiements: () => `<div class="carte"><div class="carte-tete"><h3>Moyens de paiement</h3></div>${inter('paiements.wave', 'Wave', 'Proposé au client à l’étape de paiement.')}${inter('paiements.orange', 'Orange Money', 'Proposé au client à l’étape de paiement.')}
        ${!eff('paiements.wave').v && !eff('paiements.orange').v ? `<div class="bandeau demo" style="margin:14px 0 0">${I.alert}<div><b>Aucun moyen de paiement actif.</b> Les clients verront « paiement mobile indisponible, merci de régler au comptoir ».</div></div>` : ''}</div>`,
      catalogue: () => {
        const vus = new Map(); fl.bornes.forEach(b => ((b.etat && b.etat.catalogue) || []).forEach(m => vus.set(m.id, m.name)));
        const masq = new Set(eff('catalogue.masquees').v || []); const l = [...vus.entries()];
        return `<div class="carte"><div class="carte-tete"><h3>Catalogue</h3><span class="aide">${l.length ? l.length + ' montures déclarées par les bornes' : ''}</span></div>
        ${l.length ? l.map(([id, nom]) => `<div class="rg-ligne"><div class="txt"><b>${esc(nom)}</b><span>${esc(id)}</span></div><label class="interrupteur"><input type="checkbox" data-monture="${esc(id)}" ${masq.has(id) ? '' : 'checked'} aria-label="${esc(nom)} visible"><i></i></label></div>`).join('') + (sur() ? '' : '') : '<div class="vide"><strong>Aucune monture déclarée.</strong>Les bornes envoient la liste de leurs montures avec leur signe de vie.</div>'}
        <p class="sous" style="margin-top:10px">Une monture masquée disparaît du choix de la borne ; elle n'est pas supprimée. Ajouter une monture reste une mise à jour du logiciel (modèle 3D livré par le graphiste).</p></div>`; },
      horaires: () => { const act = eff('horaires.actif').v, js = eff('horaires.jours').v || [0, 1, 2, 3, 4, 5, 6]; return `<div class="carte"><div class="carte-tete"><h3>Horaires</h3></div>${inter('horaires.actif', 'Fermer la borne en dehors des horaires', 'Hors horaires, l’écran affiche « Borne fermée » avec l’heure d’ouverture. L’application reste allumée.')}
        <div class="champs-ligne" style="margin-top:12px;${act ? '' : 'opacity:.55'}">${champ('horaires.debut', 'Ouverture', 'time')}${champ('horaires.fin', 'Fermeture', 'time')}</div>
        <div style="margin-top:14px;${act ? '' : 'opacity:.55'}"><div class="sous" style="margin-bottom:6px">Jours d'ouverture</div><div class="jours">${[1, 2, 3, 4, 5, 6, 0].map(j => `<label><input type="checkbox" data-jour="${j}" ${js.includes(j) ? 'checked' : ''}>${jours[j]}</label>`).join('')}</div></div>
        <p class="sous" style="margin-top:12px">Une fermeture avant l'ouverture (ex. 22:00 → 06:00) signifie une ouverture de nuit.</p></div>`; },
      maintenance: () => `<div class="carte"><div class="carte-tete"><h3>Maintenance</h3></div>${inter('maintenance.actif', sur() ? 'Cette borne est en maintenance' : 'Mettre toutes les bornes en maintenance', 'L’écran est verrouillé avec votre message. Un client en cours d’essayage est ramené à l’accueil.')}
        <div style="margin-top:10px">${champ('maintenance.message', 'Message affiché aux clients', 'text', 'maxlength="160" placeholder="Borne momentanément indisponible. Merci de vous adresser à un conseiller."')}</div>
        ${!sur() ? `<div class="bandeau demo" style="margin:14px 0 0">${I.alert}<div>Ce réglage concerne <b>toutes les bornes</b>. Pour une seule borne, choisissez-la plus haut ou utilisez « Passer en maintenance » dans la page Bornes.</div></div>` : ''}</div>`,
      suivi: () => `<div class="carte"><div class="carte-tete"><h3>Suivi de la tête</h3><span class="puce attention">${I.alert}Réglage expert</span></div>
        <p class="sous" style="margin-bottom:12px">Ces valeurs règlent la façon dont la monture se pose et disparaît. Elles sont fixées à l'usine pour une tête adulte courante ; la page « Qualité d'essayage » propose de les ajuster d'après les mesures réelles.</p>
        <div class="champs-ligne">${champ('suivi.k_min', 'Largeur de tête minimale (K)', 'number', 'min="0.70" max="0.95" step="0.01"')}${champ('suivi.k_max', 'Largeur de tête maximale (K)', 'number', 'min="1.00" max="1.35" step="0.01"')}</div>
        <div class="champs-ligne" style="margin-top:12px">${champ('suivi.fondu_debut_cm', 'Début du fondu des branches (cm)', 'number', 'min="-9" max="-4" step="0.1"')}${champ('suivi.fondu_fin_cm', 'Fin du fondu des branches (cm)', 'number', 'min="-11" max="-6" step="0.1"')}${champ('suivi.maintien_ms', 'Maintien après perte du visage (ms)', 'number', 'min="300" max="3000" step="100"')}</div>
        <p class="sous" style="margin-top:12px">Le fondu des branches s'applique à la prochaine monture montrée ; les autres réglages, immédiatement. <a href="#" data-resetsection="suivi">Rétablir les valeurs d'usine</a></p></div>`,
      maj: () => {
        const bs = fl.bornes, cont = eff('mise_a_jour.autorisee').v !== false;
        const autorisee = b => { const o = etat.bornes[b.nom] && etat.bornes[b.nom].mise_a_jour; return o ? o.autorisee !== false : (etat.global.mise_a_jour ? etat.global.mise_a_jour.autorisee !== false : true); };
        const LIB = { inactive: 'Non applicable', a_jour: 'À jour', telechargement: 'Téléchargement', prete: 'Prête', erreur: 'En échec' };
        return `<div class="carte"><div class="carte-tete"><h3>Mises à jour automatiques</h3></div>${inter('mise_a_jour.autorisee', sur() ? 'Autoriser les mises à jour sur cette borne' : 'Autoriser les mises à jour sur toutes les bornes', 'Quand c’est coupé, la borne ne vérifie ni n’installe rien : elle reste sur sa version.')}
          <p class="sous" style="margin-top:6px">Une mise à jour s'installe la nuit, jamais pendant un essayage. Chaque version est un brouillon sur GitHub tant que vous ne l'avez pas publiée.</p></div>
        <div class="carte" style="margin-top:16px"><div class="carte-tete"><h3>Déploiement progressif</h3><span class="aide">essayer sur quelques bornes d'abord</span></div>
          <p class="sous" style="margin-bottom:10px">Cochez les bornes <b>pilotes</b> : elles seules recevront les mises à jour. Quand la version a fait ses preuves, rouvrez-les à toutes.</p>
          <div class="defile"><table class="tab"><thead><tr><th>Pilote</th><th>Borne</th><th>Version</th><th>Mise à jour</th><th>Autorisée</th></tr></thead><tbody>${bs.map(b => `<tr><td><input type="checkbox" data-pilote="${esc(b.nom)}" aria-label="${esc(b.nom)} pilote"></td><td><strong>${esc(b.nom)}</strong><div class="sous">${esc(b.boutique || '')}</div></td><td>${esc(b.build || '—')}</td><td>${esc(LIB[b.etat && b.etat.maj] || '—')}${b.etat && b.etat.maj_version ? ' ' + esc(b.etat.maj_version) : ''}</td><td>${autorisee(b) ? '<span class="puce bon">Oui</span>' : '<span class="puce attention">Gelée</span>'}</td></tr>`).join('')}</tbody></table></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn principal" id="mPilotes">Autoriser seulement les bornes cochées</button><button class="btn" id="mToutes">Rouvrir à toutes les bornes</button><button class="btn" id="mVerif">${I.cloud}Vérifier maintenant sur les bornes autorisées</button></div></div>
        <div class="bandeau info" style="margin-top:16px">${I.info}<div><b>Publier une version :</b> <code>npm version patch</code> puis <code>git push origin main --follow-tags</code>. GitHub construit l'installateur et crée un brouillon de Release. Essayez-le sur une borne pilote, puis cliquez « Publish release » : les bornes autorisées la téléchargent dans les 6 heures.</div></div>`; },
    };

    const afficher = () => {
      const nb = nbCh();
      c.innerHTML = `<div class="filtres"><label class="champ" style="min-width:260px">Réglages de<select id="rgPortee"><option value="global" ${etat.portee === 'global' ? 'selected' : ''}>Toutes les bornes</option>${fl.bornes.map(b => `<option value="borne:${esc(b.nom)}" ${etat.portee === 'borne:' + b.nom ? 'selected' : ''}>${esc(b.nom)} (${esc(b.boutique || '')})</option>`).join('')}</select></label>
        <span class="sous" style="align-self:center">${sur() ? 'Cette borne ne garde que ce qu’elle change : le reste vient de « toutes les bornes ».' : 'Ces réglages valent pour toutes les bornes, sauf celles qui les remplacent.'}</span><span class="espace"></span><span class="puce">Version ${rg.version}</span></div>
      <div class="reglages"><div class="onglets" role="tablist">${ONGLETS.map(([k, l, ic]) => `<button role="tab" data-onglet="${k}" aria-selected="${etat.onglet === k}">${I[ic]}${esc(l)}</button>`).join('')}</div>
        <div id="rgCorps">${onglet[etat.onglet]()}</div></div>
      <div class="barre-sauvegarde" ${sale() ? '' : 'hidden'} role="status"><div class="txt"><b>Modifications non enregistrées</b><br><span class="sous">${[...new Set(diff().map(SECTION_DE))].map(k => LIB_SECTION[k] || k).join(', ')}</span></div><button class="btn" id="rgAnnuler">Annuler</button><button class="btn principal" id="rgSauver">Enregistrer et envoyer aux bornes</button></div>`;
      brancher();
    };
    function diff() { const ch = []; const marche = (a, b, pre) => { const ks = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); ks.forEach(k => { const x = a && a[k], y = b && b[k], p = pre ? pre + '.' + k : k; if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) marche(x, y, p); else if (JSON.stringify(x) !== JSON.stringify(y)) ch.push(p); }); }; marche(etat.draft, etat.original, ''); return ch; }
    function majBarre() { const b = $('.barre-sauvegarde', c); if (!b) return; b.hidden = !sale(); $('.sous', b).textContent = [...new Set(diff().map(SECTION_DE))].map(k => LIB_SECTION[k] || k).join(', '); }

    function brancher() {
      $$('[data-onglet]', c).forEach(b => b.addEventListener('click', () => { etat.onglet = b.dataset.onglet; afficher(); }));
      $('#rgPortee', c).addEventListener('change', async e => { if (sale() && !await confirmer({ titre: 'Abandonner les modifications ?', texte: 'Elles n’ont pas été enregistrées.', bouton: 'Abandonner', danger: true })) { e.target.value = etat.portee; return; } etat.portee = e.target.value; charger(); afficher(); });
      $$('[data-ch]', c).forEach(el => {
        const ch = el.dataset.ch, evt = el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? undefined : +el.value) : el.value;
          if (v === undefined || v === '') { if (ch === 'accueil.message' || ch === 'maintenance.message') v = ''; else { effacer(etat.draft, ch); majBarre(); return; } }
          ecrire(etat.draft, ch, v); majBarre();
          if (el.type === 'checkbox') afficher();
          if (ch.startsWith('prix.')) { const t = $('.bandeau.info b', c); if (t) afficher(); }
        });
        if (el.type === 'number') el.addEventListener('change', () => { if (ch.startsWith('prix.')) afficher(); });
      });
      $$('[data-reset]', c).forEach(a => a.addEventListener('click', e => { e.preventDefault(); effacer(etat.draft, a.dataset.reset); afficher(); }));
      $$('[data-resetsection]', c).forEach(a => a.addEventListener('click', e => { e.preventDefault(); delete etat.draft[a.dataset.resetsection]; afficher(); }));
      $$('[data-jour]', c).forEach(el => el.addEventListener('change', () => { const js = $$('[data-jour]', c).filter(x => x.checked).map(x => +x.dataset.jour); if (!lire(etat.draft, 'horaires.debut')) { ecrire(etat.draft, 'horaires.debut', eff('horaires.debut').v); ecrire(etat.draft, 'horaires.fin', eff('horaires.fin').v); ecrire(etat.draft, 'horaires.actif', eff('horaires.actif').v); } ecrire(etat.draft, 'horaires.jours', js); majBarre(); }));
      $$('[data-monture]', c).forEach(el => el.addEventListener('change', () => { const masq = new Set(eff('catalogue.masquees').v || []); if (el.checked) masq.delete(el.dataset.monture); else masq.add(el.dataset.monture); ecrire(etat.draft, 'catalogue.masquees', [...masq]); majBarre(); }));
      const an = $('#rgAnnuler', c); if (an) an.addEventListener('click', () => { etat.draft = clone(etat.original); afficher(); });
      const sv = $('#rgSauver', c); if (sv) sv.addEventListener('click', enregistrer);
      const mp = $('#mPilotes', c); if (mp) { mp.addEventListener('click', pilotes); $('#mToutes', c).addEventListener('click', toutes); $('#mVerif', c).addEventListener('click', verifier); }
    }
    async function enregistrer() {
      const sections = [...new Set(diff().map(SECTION_DE))], risque = sections.filter(k => ['prix', 'maintenance', 'paiements', 'horaires'].includes(k));
      // Un horaire ou un prix incomplet ne doit pas partir : on complète avec ce que l'écran montre.
      if (etat.draft.horaires && (etat.draft.horaires.debut == null || etat.draft.horaires.fin == null)) { etat.draft.horaires.debut = eff('horaires.debut').v; etat.draft.horaires.fin = eff('horaires.fin').v; }
      const cible = sur() ? `la borne <b>${esc(etat.portee.slice(6))}</b>` : '<b>toutes les bornes</b>';
      if (!await confirmer({ titre: 'Envoyer ces réglages ?', html: `Vous modifiez : <b>${sections.map(k => LIB_SECTION[k] || k).join(', ')}</b> pour ${cible}. Ils s'appliquent à leur prochain signe de vie (au plus une minute).${risque.length ? `<br><br><b>Attention :</b> ${risque.map(k => LIB_SECTION[k]).join(', ')} agi${risque.length > 1 ? 'ssent' : 't'} directement sur ce que voient les clients.` : ''}`, bouton: 'Envoyer' })) return;
      try {
        const r = await api('/api/reglages', { method: 'POST', body: { portee: etat.portee, donnees: etat.draft } });
        if (etat.portee === 'global') etat.global = r.donnees; else etat.bornes[etat.portee.slice(6)] = r.donnees;
        etat.original = clone(r.donnees); etat.draft = clone(r.donnees); etat.versionServeur = r.version; rg.version = r.version; toast('Réglages enregistrés, version ' + r.version + '.'); afficher();
      } catch (e) { toast('Échec : ' + e.message, true); }
    }
    async function ecrireMaj(portee, donnees) { const r = await api('/api/reglages', { method: 'POST', body: { portee, donnees } }); return r; }
    async function pilotes() {
      const choix = $$('[data-pilote]', c).filter(x => x.checked).map(x => x.dataset.pilote);
      if (!choix.length) return toast('Cochez au moins une borne pilote.', true);
      if (!await confirmer({ titre: 'Déploiement progressif ?', html: `Seules ces bornes recevront les mises à jour : <b>${choix.map(esc).join(', ')}</b>. Les autres restent sur leur version.`, bouton: 'Appliquer' })) return;
      try {
        await ecrireMaj('global', { ...etat.global, mise_a_jour: { autorisee: false } });
        for (const b of fl.bornes) { const sb = { ...(etat.bornes[b.nom] || {}) }; if (choix.includes(b.nom)) sb.mise_a_jour = { autorisee: true }; else delete sb.mise_a_jour; await ecrireMaj('borne:' + b.nom, sb); }
        toast('Déploiement progressif en place.'); App.rg = null; Vues['admin/reglages'](c);
      } catch (e) { toast('Échec : ' + e.message, true); }
    }
    async function toutes() {
      if (!await confirmer({ titre: 'Rouvrir à toutes les bornes ?', texte: 'Toutes les bornes pourront de nouveau recevoir les mises à jour.', bouton: 'Rouvrir' })) return;
      try { const g = { ...etat.global }; delete g.mise_a_jour; await ecrireMaj('global', g); for (const b of fl.bornes) { const sb = { ...(etat.bornes[b.nom] || {}) }; if (sb.mise_a_jour) { delete sb.mise_a_jour; await ecrireMaj('borne:' + b.nom, sb); } } toast('Mises à jour rouvertes.'); App.rg = null; Vues['admin/reglages'](c); } catch (e) { toast('Échec : ' + e.message, true); }
    }
    async function verifier() {
      const cibles = fl.bornes.filter(b => b.statut === 'en_ligne'); let n = 0;
      for (const b of cibles) { await api('/api/commande', { method: 'POST', body: { borne: b.nom, action: 'verifier_maj' } }); n++; }
      toast('Vérification demandée à ' + n + ' borne' + (n > 1 ? 's' : '') + ' (les bornes gelées l’ignorent).');
    }
    afficher();
  };
})();
