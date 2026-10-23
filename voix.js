/**
 * N.O.A — Assistance vocale de la borne.
 *
 * Pensée pour les clients qui ne lisent pas ou maîtrisent mal le français, surtout les personnes âgées :
 * la voix est d'abord en WOLOF. L'interface reste en français.
 *
 * Les consignes wolof sont des ENREGISTREMENTS faits ou validés par un locuteur natif, déposés dans
 * assets/voix/wo/<identifiant>.mp3 (voir VOIX_WOLOF.md). Aucune voix de synthèse n'est utilisée pour le
 * wolof : une traduction vocale automatique non vérifiée serait pire que le silence.
 *
 * Tant qu'un enregistrement wolof manque, la borne dit la consigne en FRANÇAIS (fichier assets/voix/fr/…
 * s'il existe, sinon voix de synthèse française du système). Le repli est signalé dans la console et par
 * `etat().source`; `node outils/voix-manque.js` liste ce qu'il reste à enregistrer.
 *
 * Fonctionne dans le navigateur (window.NOAVoix) et sous Node (liste des consignes, banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOAVoix = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DOSSIER = 'assets/voix';
  const EXTENSIONS = ['mp3', 'ogg', 'wav'];
  const LANGUE_DEFAUT = 'wo';
  const LANGUES = ['wo', 'fr'];
  const REPLI_FRANCAIS = true;          // wolof manquant -> consigne en français plutôt que le silence
  const CLE = 'noa.voix';

  /* Une consigne = une étape du parcours. Textes courts : ils sont lus à des personnes qui découvrent la borne.
     `fr` est la référence française : texte de la voix de repli et texte à faire enregistrer en wolof. */
  const CONSIGNES = {
    accueil:         { fr: 'Bienvenue. Touchez le bouton pour commencer l\'essayage.' },
    essayage:        { fr: 'Approchez-vous de la caméra. Regardez l\'écran. Choisissez la monture qui vous plaît.' },
    ordonnance:      { fr: 'Placez votre ordonnance devant la caméra.' },
    scan:            { fr: 'Le scan est réussi.' },
    scan_echec:      { fr: 'L\'ordonnance n\'est pas lisible. Recommencez : tenez-la bien droite, à la lumière.' },
    paiement_echec:  { fr: 'Le paiement n\'a pas abouti. Recommencez.' },
    verres:          { fr: 'Choisissez vos verres : lumière bleue, ou photochromiques.' },
    paiement_wave:   { fr: 'Scannez le QR code avec Wave pour payer.' },
    paiement_orange: { fr: 'Scannez le QR code avec Orange Money pour payer.' },
    merci:           { fr: 'Merci. Votre commande est enregistrée.' },
  };

  const chemin = (langue, id, ext) => `${DOSSIER}/${langue}/${id}.${ext || EXTENSIONS[0]}`;

  /** Pour l'outil de contrôle : quels enregistrements manquent. `existe(chemin)` -> booléen. */
  function manquants(langue, existe) {
    return Object.keys(CONSIGNES).filter(id => !EXTENSIONS.some(e => existe(chemin(langue, id, e))));
  }

  /* ── Navigateur ─────────────────────────────────────────────────── */
  const etatInterne = { actif: true, langue: LANGUE_DEFAUT, etape: 'accueil', dernier: 'accueil', source: 'aucune', lecture: false, recherche: false };
  let _audio = null, _jeton = 0, _rappel = null, _avertis = new Set();

  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}'); } catch (_) { return {}; } };
  const ecrire = v => { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (_) {} };
  const prevenir = () => { if (_rappel) try { _rappel(etat()); } catch (_) {} };

  function init(opts) {
    _rappel = (opts && opts.surChangement) || null;
    const m = lire();
    etatInterne.actif = m.actif !== false;           // le réglage « voix activée » est celui de la boutique
    etatInterne.langue = LANGUE_DEFAUT;              // la langue, elle, repart du défaut à chaque client
    prevenir();
  }

  function essayerFichier(src) {
    return new Promise(resolve => {
      const a = new Audio();
      a.preload = 'auto';
      const fin = ok => { a.onerror = a.oncanplay = null; resolve(ok ? a : null); };
      a.oncanplay = () => fin(true);
      a.onerror = () => fin(false);
      a.src = src;
    });
  }
  async function premierFichier(langue, id) {
    for (const e of EXTENSIONS) { const a = await essayerFichier(chemin(langue, id, e)); if (a) return a; }
    return null;
  }

  function arreter() {
    _jeton++; etatInterne.recherche = false;
    if (_audio) { try { _audio.pause(); } catch (_) {} _audio = null; }
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (_) {}
    if (etatInterne.lecture) { etatInterne.lecture = false; prevenir(); }
  }

  async function jouer(id) {
    const c = CONSIGNES[id]; if (!c) return;
    arreter();
    const jeton = _jeton;
    etatInterne.dernier = id; etatInterne.source = 'aucune'; etatInterne.recherche = true;
    let a = await premierFichier(etatInterne.langue, id), source = 'fichier';
    if (!a && etatInterne.langue === 'wo' && REPLI_FRANCAIS) {
      if (!_avertis.has(id)) { _avertis.add(id); console.warn(`[Voix] enregistrement wolof absent : ${chemin('wo', id)} — consigne dite en français`); }
      a = await premierFichier('fr', id); source = 'fichier-fr';
    }
    if (jeton !== _jeton) return;                     // une autre consigne a pris la place
    etatInterne.recherche = false;
    if (a) {
      _audio = a;
      etatInterne.source = source; etatInterne.lecture = true; prevenir();
      a.onended = a.onerror = () => { if (_audio === a) { _audio = null; etatInterne.lecture = false; prevenir(); } };
      a.play().catch(() => { etatInterne.lecture = false; prevenir(); });
      return;
    }
    // Dernier recours : voix de synthèse FRANÇAISE du système (jamais pour le wolof)
    if (typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined') {
      const u = new SpeechSynthesisUtterance(c.fr);
      u.lang = 'fr-FR'; u.rate = 0.88;
      u.onend = u.onerror = () => { if (jeton === _jeton) { etatInterne.lecture = false; prevenir(); } };
      etatInterne.source = 'synthese-fr'; etatInterne.lecture = true; prevenir();
      speechSynthesis.speak(u);
    } else {
      etatInterne.source = 'aucune'; prevenir();
    }
  }

  /** Entrée dans une étape : la consigne se dit toute seule si la voix est activée. */
  function etape(id) {
    etatInterne.etape = id;
    if (etatInterne.actif) jouer(id); else prevenir();
  }
  /** Bouton « Écouter les instructions » : réécoute la consigne de l'étape, autant de fois que voulu. */
  function reecouter() { return jouer(etatInterne.etape); }
  function activer(oui) {
    etatInterne.actif = !!oui; ecrire({ actif: etatInterne.actif });
    if (!etatInterne.actif) arreter();
    prevenir();
  }
  function langue(l) {
    if (!LANGUES.includes(l)) return;
    etatInterne.langue = l;
    prevenir();
    if (etatInterne.actif) jouer(etatInterne.etape);   // on entend tout de suite la langue choisie
  }
  /** Nouveau client : langue du défaut, plus de son, retour à l'accueil. */
  function raz() {
    arreter(); etatInterne.langue = LANGUE_DEFAUT; etatInterne.etape = 'accueil'; prevenir();
  }
  function etat() { return { ...etatInterne }; }

  return { CONSIGNES, EXTENSIONS, LANGUES, LANGUE_DEFAUT, REPLI_FRANCAIS, DOSSIER, chemin, manquants,
           init, etape, reecouter, activer, langue, arreter, raz, etat };
});
