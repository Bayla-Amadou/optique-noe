/* N.O.A — Pilotage · graphiques en SVG, sans dépendance.
   Règles tenues partout : une seule échelle par graphique, marques fines
   (colonnes ≤ 24 px, bout arrondi de 4 px, courbes de 2 px), grille d'un trait,
   une couleur par série, légende dès deux séries, infobulle au survol ET au
   clavier, et une vue « tableau » pour chaque graphique. */
'use strict';
const Graph = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /* Échelle « jolie » : 0, 50, 100… jamais 0, 37, 74. */
  function echelle(max) {
    if (!(max > 0)) return { max: 1, pas: 1 };
    const p = Math.pow(10, Math.floor(Math.log10(max))), m = max / p;
    const pas = (m <= 1 ? .2 : m <= 2 ? .5 : m <= 5 ? 1 : 2) * p;
    return { max: Math.ceil(max / pas - 1e-9) * pas, pas };
  }

  /* ── Infobulle unique pour toute la page ── */
  let bulle = null;
  function montrer(texte, x, y) {
    if (!bulle) bulle = document.getElementById('infobulle');
    if (!bulle) return;
    bulle.textContent = texte; bulle.classList.add('on');
    const w = bulle.offsetWidth;
    bulle.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + 'px';
    bulle.style.top = Math.max(8, y - 46) + 'px';
  }
  function cacher() { if (bulle) bulle.classList.remove('on'); }
  document.addEventListener('pointerover', e => { const c = e.target.closest && e.target.closest('[data-bulle]'); if (c) { const r = c.getBoundingClientRect(); montrer(c.dataset.bulle, r.left + r.width / 2, r.top); } });
  document.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('[data-bulle]')) cacher(); });
  document.addEventListener('focusin', e => { const c = e.target.closest && e.target.closest('[data-bulle]'); if (c) { const r = c.getBoundingClientRect(); montrer(c.dataset.bulle, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', cacher);

  /* ── Colonnes ── */
  function colonnes({ donnees, valeur, etiqX, fmtY = String, titre, bande, hauteur = 190, largeur = 420, etiqColonne }) {
    const L = 42, R = 8, T = 14, B = 26, W = largeur, H = hauteur, iw = W - L - R, ih = H - T - B;
    const vmax = Math.max(0, ...donnees.map(valeur)), ech = echelle(vmax || 1);
    const slot = iw / Math.max(1, donnees.length), ep = Math.min(24, Math.max(4, slot - 2));
    const y = v => T + ih - (v / ech.max) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}">`;
    if (bande) { const x0 = L + slot * bande.de, x1 = L + slot * bande.a; s += `<rect class="bande" x="${x0}" y="${T}" width="${x1 - x0}" height="${ih}" rx="4"/><text class="etiq-bande" x="${x0 + 6}" y="${T + 12}">${esc(bande.texte)}</text>`; }
    s += '<g class="grille axe">';
    for (let v = 0; v <= ech.max + 1e-9; v += ech.pas) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 7}" y="${y(v) + 4}" text-anchor="end">${esc(fmtY(v))}</text>`;
    s += `</g><g class="base"><line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/></g>`;
    donnees.forEach((d, i) => {
      const v = valeur(d), h = Math.max(0, (v / ech.max) * ih), x = L + i * slot + (slot - ep) / 2, yy = y(v), r = Math.min(4, ep / 2, h);
      const lib = etiqColonne ? etiqColonne(d) : String(v);
      if (h > 0) s += `<path class="colonne" tabindex="0" data-bulle="${esc(lib)}" aria-label="${esc(lib)}" d="M${x} ${yy + h}V${yy + r}Q${x} ${yy} ${x + r} ${yy}H${x + ep - r}Q${x + ep} ${yy} ${x + ep} ${yy + r}V${yy + h}Z"/>`;
      else s += `<rect class="colonne" tabindex="0" data-bulle="${esc(lib)}" aria-label="${esc(lib)}" x="${x}" y="${y(0) - 1}" width="${ep}" height="1" opacity=".3"/>`;
      const e = etiqX ? etiqX(d, i) : null;
      if (e != null) s += `<text class="axe" x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle" style="fill:var(--encre-3);font-size:11px">${esc(e)}</text>`;
    });
    return s + '</svg>';
  }

  /* ── Courbe + aire, survol par repère vertical ── */
  function courbe({ points, fmtY = String, titre, hauteur = 220, largeur = 640, etiqX, libelle }) {
    const L = 48, R = 12, T = 14, B = 26, W = largeur, H = hauteur, iw = W - L - R, ih = H - T - B;
    const vmax = Math.max(0, ...points.map(p => p.y)), ech = echelle(vmax || 1);
    const n = points.length, x = i => L + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw), y = v => T + ih - (v / ech.max) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}" data-courbe="1">`;
    s += '<g class="grille axe">';
    for (let v = 0; v <= ech.max + 1e-9; v += ech.pas) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtY(v))}</text>`;
    s += '</g>';
    const pas = Math.max(1, Math.ceil(n / 7));
    // La dernière étiquette est toujours montrée ; celle d'avant est retirée si elle la toucherait.
    points.forEach((p, i) => { if ((i % pas === 0 && (n - 1 - i >= pas * 0.8 || i === n - 1)) || i === n - 1) s += `<text class="axe" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" style="fill:var(--encre-3);font-size:11px">${esc(etiqX ? etiqX(p, i) : p.x)}</text>`; });
    if (n) {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join('');
      s += `<path class="aire" d="${d}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z"/><path class="courbe" d="${d}"/>`;
      const dernier = points[n - 1]; s += `<circle class="point" cx="${x(n - 1)}" cy="${y(dernier.y)}" r="4.5"/>`;
    }
    s += `<g class="survol" style="display:none"><line class="repere" y1="${T}" y2="${T + ih}"/><circle class="point" r="4.5"/></g>`;
    s += `<rect class="zone" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" tabindex="0" aria-label="${esc(titre)} : survol clavier avec les flèches"/></svg>`;
    return { html: s, brancher(el) {
      const svg = el.querySelector('svg[data-courbe]'); if (!svg) return;
      const zone = svg.querySelector('.zone'), g = svg.querySelector('.survol'), rep = g.querySelector('.repere'), pt = g.querySelector('circle');
      let courant = n - 1;
      const montrerIdx = i => {
        i = Math.max(0, Math.min(n - 1, i)); courant = i; const p = points[i];
        g.style.display = ''; rep.setAttribute('x1', x(i)); rep.setAttribute('x2', x(i)); pt.setAttribute('cx', x(i)); pt.setAttribute('cy', y(p.y));
        const r = zone.getBoundingClientRect(), sx = r.left + ((x(i) - L) / iw) * r.width;
        montrer(libelle ? libelle(p) : `${p.x} : ${fmtY(p.y)}`, sx, r.top + ((y(p.y) - T) / ih) * r.height);
      };
      zone.addEventListener('pointermove', e => { const r = zone.getBoundingClientRect(); montrerIdx(Math.round(((e.clientX - r.left) / r.width) * (n - 1))); });
      zone.addEventListener('pointerleave', () => { g.style.display = 'none'; cacher(); });
      zone.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { montrerIdx(courant - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { montrerIdx(courant + 1); e.preventDefault(); } });
      zone.addEventListener('blur', () => { g.style.display = 'none'; cacher(); });
    } };
  }

  /* ── Petite courbe d'un indicateur : une ligne, rien d'autre ── */
  function trace(valeurs) {
    if (!valeurs || valeurs.length < 2) return '';
    const W = 92, H = 34, mx = Math.max(...valeurs), mn = Math.min(...valeurs), et = (mx - mn) || 1;
    const d = valeurs.map((v, i) => `${i ? 'L' : 'M'}${((i / (valeurs.length - 1)) * (W - 6) + 3).toFixed(1)} ${(H - 5 - ((v - mn) / et) * (H - 10)).toFixed(1)}`).join('');
    return `<svg class="trace" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--serie)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /* ── Barres horizontales classées : « qui vend le plus » ── */
  function barresH(items, fmt = String) {
    const mx = Math.max(1, ...items.map(i => i.valeur));
    if (!items.length) return '<div class="vide">Aucune donnée sur la période.</div>';
    return '<div class="barres-h">' + items.map(i => `<div class="barre-h"><div class="ligne"><span>${esc(i.nom)}</span><span class="chiffres">${esc(fmt(i.valeur))}${i.sous ? ' · ' + esc(i.sous) : ''}</span></div><div class="piste"><div class="remplie" style="width:${Math.max(2, (i.valeur / mx) * 100)}%"></div></div></div>`).join('') + '</div>';
  }

  /* ── Barre empilée (répartition) : légende toujours présente ── */
  const COULEURS = ['var(--serie)', 'var(--serie-2)', 'var(--serie-3)'];
  function empile(items, fmt = String) {
    const tot = items.reduce((s, i) => s + i.valeur, 0);
    if (!tot) return '<div class="vide">Aucune donnée sur la période.</div>';
    const barre = '<div class="empile" role="img" aria-label="Répartition">' + items.map((i, k) => `<span style="width:${(i.valeur / tot) * 100}%;background:${COULEURS[k % 3]}" data-bulle="${esc(i.nom)} : ${esc(fmt(i.valeur))} (${Math.round(i.valeur / tot * 100)} %)"></span>`).join('') + '</div>';
    const leg = '<div class="legende">' + items.map((i, k) => `<span><i style="background:${COULEURS[k % 3]}"></i>${esc(i.nom)} — <b class="chiffres">${esc(fmt(i.valeur))}</b> (${Math.round(i.valeur / tot * 100)} %)</span>`).join('') + '</div>';
    return barre + leg;
  }

  /* ── Habillage commun : titre, graphique, bascule tableau ── */
  function carte({ id, titre, sous, corps, tableau, entetes, droite }) {
    const t = tableau ? `<div class="defile" hidden data-tab="${id}"><table class="tab"><thead><tr>${entetes.map(e => `<th>${esc(e)}</th>`).join('')}</tr></thead><tbody>${tableau.map(l => '<tr>' + l.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('')}</tbody></table></div>` : '';
    return `<div class="carte graph" data-graph="${id}"><div class="carte-tete"><h3>${esc(titre)}</h3>${sous ? `<span class="aide">${esc(sous)}</span>` : ''}<span class="droite">${droite || ''}</span></div><div class="plan">${corps}</div>${t}${tableau ? `<button class="bascule-vue" type="button" data-bascule="${id}">Voir en tableau</button>` : ''}</div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-bascule]'); if (!b) return;
    const c = b.closest('[data-graph]'), t = c.querySelector('[data-tab]'), p = c.querySelector('.plan'), voir = t.hidden;
    t.hidden = !voir; p.hidden = voir; b.textContent = voir ? 'Voir le graphique' : 'Voir en tableau';
  });

  return { colonnes, courbe, trace, barresH, empile, carte, echelle, esc };
})();
