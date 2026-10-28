/**
 * N.O.A — Lecture d'une carte RFID sur la borne.
 *
 * La borne HN-27SK-F est livrée avec un lecteur RFID. Presque tous ces lecteurs se présentent à
 * l'ordinateur comme un CLAVIER : quand une carte passe devant, le lecteur « tape » l'identifiant
 * de la carte puis Entrée. Aucun pilote, aucun port série, rien à installer. L'ennui, c'est que la
 * page ne voit alors qu'une suite de touches, indiscernable de quelqu'un qui tape.
 *
 * ── CE QUI DISTINGUE UNE CARTE D'UN DOIGT ───────────────────────────────────
 * La VITESSE, et elle seule. Un lecteur envoie huit à douze caractères en moins d'un dixième de
 * seconde, régulièrement espacés. Un être humain, même rapide, met dix fois plus de temps et
 * n'est jamais régulier. On exige donc : des caractères tous du même alphabet, séparés de moins de
 * `ENTRE_MAX` millisecondes, terminés par Entrée, le tout en moins de `TOTAL_MAX`. Dès qu'un écart
 * est trop grand, on repart de zéro : la frappe d'un client ne peut pas être prise pour une carte.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ────────────────────────────────────────────
 * Il ne décide RIEN. Il dit « une carte vient d'être lue, voici son identifiant ». Ce qu'on en fait
 * — ouvrir la session d'un opticien, retrouver une commande — se décide ailleurs, et l'identifiant
 * d'une carte n'est pas un secret : il se recopie. Voir RFID.md.
 *
 * Fonctionne dans le navigateur (window.NOARfid) et sous Node (banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOARfid = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGLAGES = {
    ENTRE_MAX: 60,      // ms entre deux caractères : au-delà, c'est une main
    TOTAL_MAX: 500,     // ms pour la carte entière
    MIN: 6,             // caractères : en dessous, ce n'est pas un identifiant de carte
    MAX: 32,
    ALPHABET: /^[0-9A-Za-z]$/,   // les lecteurs envoient du décimal ou de l'hexadécimal
    FIN: ['Enter', 'Tab'],
  };

  function creer(reglages) {
    const c = Object.assign({}, REGLAGES, reglages || {});
    let tampon = '', debut = 0, dernier = 0;
    const vider = () => { tampon = ''; debut = 0; dernier = 0; };

    return {
      reglages: c,
      raz: vider,
      /** Ce qui est en cours d'accumulation — pour le diagnostic, jamais pour décider. */
      etat() { return { taille: tampon.length, ms: tampon ? dernier - debut : 0 }; },
      /**
       * À appeler pour chaque touche.
       * @param touche  nom de la touche (`event.key`)
       * @param maintenant  horodatage en ms (`event.timeStamp` ou performance.now())
       * @returns  null, ou { uid, ms, taille } quand une carte vient d'être lue
       */
      touche(touche, maintenant) {
        const t = Number.isFinite(maintenant) ? maintenant : Date.now();
        // Un trou dans la frappe : ce qui précédait n'était pas une carte.
        if (tampon && t - dernier > c.ENTRE_MAX) vider();

        if (c.FIN.includes(touche)) {
          const uid = tampon, ms = dernier - debut, n = uid.length;
          vider();
          if (n < c.MIN || n > c.MAX) return null;
          if (ms > c.TOTAL_MAX) return null;          // trop lent : une main
          return { uid, ms, taille: n };
        }
        if (!c.ALPHABET.test(touche)) { vider(); return null; }   // une touche qu'un lecteur n'envoie pas
        if (!tampon) debut = t;
        dernier = t;
        if (tampon.length < c.MAX) tampon += touche;
        return null;
      },
    };
  }

  /** Vrai si le focus est dans un champ de saisie : on n'y lit pas de carte, on y écrirait du texte. */
  function saisieEnCours(doc) {
    const a = doc && doc.activeElement;
    if (!a) return false;
    const t = (a.tagName || '').toUpperCase();
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || a.isContentEditable === true;
  }

  return { REGLAGES, creer, saisieEnCours };
});
