/**
 * N.O.A — Loi de lissage de la pose de la tête.
 *
 * Un seul rythme pour la rotation ET la position de la monture : à l'arrêt on lisse fort (pas de
 * tremblement), en mouvement on suit presque brut (pas de retard). Tout tient dans le coefficient
 * `alpha`, et c'est lui qui décide si la monture paraît collée au visage ou si elle traîne derrière.
 *
 * ── POURQUOI CE MODULE EXISTE À PART ────────────────────────────────────────
 * Cette loi était écrite au milieu de la boucle de rendu, donc impossible à mesurer autrement qu'à
 * l'œil sur une vidéo. Elle est ici pour que le banc (outils/lissage-banc.js) exerce EXACTEMENT le
 * code de la borne, sur un mouvement dont la vérité est connue à la fraction de degré près.
 *
 * ── CE QUE LA MESURE A DONNÉ, ET CE QU'ELLE A DÉMENTI ───────────────────────
 * Le banc répond à la plainte « la monture traîne quand je tourne la tête ». Verdict : la loi en
 * place retarde de **moins d'une image** (22 ms au pire, sur un mouvement lent, pour une image qui
 * dure 33 ms) et l'écart à l'écran ne dépasse pas 4 px de face. Autrement dit **le lissage n'est pas
 * la cause** de ce qu'on voit. Ce qui reste à chercher est ailleurs :
 *   · la CADENCE réelle de la borne — une borne à 15 images/s paraît lente quel que soit le filtre,
 *     et rien ne l'affichait : le badge ne montrait que le temps de calcul, jamais le nombre
 *     d'images réellement livrées par la caméra (corrigé : voir `_ipsReel` dans index.html) ;
 *   · le BIAIS de MediaPipe au-delà de 45° de lacet, qui fait remonter la monture sur le front.
 *     C'est une erreur systématique de la mesure : aucun lissage ne la corrige.
 *
 * ── LA VITESSE : DEUX LOIS, ET POURQUOI ON GARDE LA PREMIÈRE ────────────────
 * Le coefficient dépend de la vitesse de la tête. Reste à savoir comment on la mesure.
 *
 *   `residu`  — la TAILLE de l'écart entre la pose lissée et la nouvelle mesure. C'est la loi en
 *               service. Une taille est toujours positive, donc le bruit de mesure s'y ajoute comme
 *               s'il s'agissait d'un mouvement : tête immobile, la loi croit voir une tête qui bouge
 *               et relâche un peu le lissage. En échange elle se corrige d'elle-même, puisque
 *               l'écart grandit tant que la monture n'a pas rejoint le visage.
 *   `vecteur` — la vitesse SIGNÉE, lissée comme un vecteur avant d'en prendre la norme : le bruit
 *               change de sens à chaque image et s'annule, un vrai mouvement survit. Essayée et
 *               mesurée : elle divise le retard par cinq sur les mouvements lents, mais **dégrade
 *               le tremblement** de profil et sur les rotations vives, parce qu'à 2° de bruit par
 *               image aucune moyenne assez courte pour rester vive n'annule assez le bruit.
 *               Sur 400 réglages balayés, aucun ne tient « ne rien dégrader ».
 *
 * On garde donc `residu`. `vecteur` reste ici, mesurable, pour le jour où le bruit de la mesure
 * baissera (meilleure caméra, meilleure lumière, modèle plus récent) : la conclusion changera alors.
 *
 * Fonctionne dans le navigateur (window.NOALissage) et sous Node (banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOALissage = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEG = Math.PI / 180;

  // Valeurs de référence, relevées au banc outils/glissement.js puis confirmées par lissage-banc.
  const REGLAGES = {
    A_MIN: 0.22,              // à l'arrêt : lisse fort
    A_MAX: 0.95,              // en mouvement : presque brut
    ZONE_MORTE: 12 * DEG,     // rad/s : en dessous, la tête est tenue pour immobile
    V_REF: 60 * DEG,          // vitesse (rad/s) où l'on suit à fond
    LISSAGE_V: 0.5,           // lissage de la vitesse elle-même (1 = brute)
    SAUT: 1.4,                // rad en une image : un glitch, pas un geste
    A_SAUT: 0.03,
    FPS_REF: 30,              // les coefficients sont exprimés pour 30 images/s

    SOURCE_V: 'residu',       // loi en service ; 'vecteur' = l'alternative étudiée (voir en tête)
    // Réglages propres à `vecteur`, sans effet sur la loi en service.
    ZONE_MORTE_RESIDU: 90 * DEG,  // le résidu n'y est qu'un filet de rattrapage
    BRUIT_REF: 20 * DEG,          // bruit qui divise par deux le coefficient d'arrêt
    ADAPTE_BRUIT: false,
  };

  function creer(reglages) {
    const c = Object.assign({}, REGLAGES, reglages || {});
    let wResidu = 0, wAbs = 0, bruit = 0, demarre = false;
    const wv = { x: 0, y: 0, z: 0 };
    return {
      reglages: c,
      raz() { wResidu = 0; wAbs = 0; bruit = 0; wv.x = wv.y = wv.z = 0; demarre = false; },
      /** Vitesses courantes, en degrés par seconde — pour le badge de diagnostic et le banc. */
      vitesses() { return { residu: wResidu / DEG, tete: Math.hypot(wv.x, wv.y, wv.z) / DEG, bruit: bruit / DEG }; },
      /**
       * @param residu  angle entre la pose lissée et la nouvelle mesure, en radians (toujours positif)
       * @param omega   vitesse SIGNÉE de la tête en rad/s : {x,y,z}, ou un nombre sur un seul axe.
       *                Ignorée par la loi en service ; sert à la loi `vecteur` et au badge.
       * @param dtS     durée de l'image, en secondes
       * @returns       coefficient dans [0, 1], déjà converti pour cette durée d'image
       */
      alpha(residu, omega, dtS) {
        if (!demarre) { demarre = true; return 1; }      // première image : on se cale sur la mesure
        const k = c.LISSAGE_V;
        wResidu = (1 - k) * wResidu + k * (residu / dtS);
        const o = typeof omega === 'number' ? { x: omega, y: 0, z: 0 } : (omega || { x: 0, y: 0, z: 0 });
        wv.x = (1 - k) * wv.x + k * o.x;
        wv.y = (1 - k) * wv.y + k * o.y;
        wv.z = (1 - k) * wv.z + k * o.z;
        const wTete = Math.hypot(wv.x, wv.y, wv.z);
        // Part incohérente de la vitesse : ce qui s'agite sans aller nulle part, c'est-à-dire le bruit.
        wAbs = (1 - k) * wAbs + k * Math.hypot(o.x, o.y, o.z);
        bruit = 0.9 * bruit + 0.1 * Math.max(0, wAbs - wTete);

        let v;
        if (c.SOURCE_V === 'vecteur') {
          // Le filet ne doit pas se déclencher sur le bruit, sans quoi une mesure agitée remettrait
          // la loi en mode « suivre tout », ce qu'on cherche précisément à éviter de profil.
          v = Math.max(Math.max(0, wTete - c.ZONE_MORTE),
                       Math.max(0, wResidu - c.ZONE_MORTE_RESIDU - 2 * bruit));
        } else {
          v = Math.max(0, wResidu - c.ZONE_MORTE);
        }
        const aMin = c.ADAPTE_BRUIT ? c.A_MIN / (1 + bruit / c.BRUIT_REF) : c.A_MIN;
        let a = Math.min(c.A_MAX, aMin + (c.A_MAX - aMin) * (v / c.V_REF));
        // Un bond de plus de 80° en une image n'est pas un geste : on se fige plutôt que de suivre.
        if (residu > c.SAUT) a = c.A_SAUT;
        return 1 - Math.pow(1 - a, dtS * c.FPS_REF);
      },
    };
  }

  return { REGLAGES, creer, DEG };
});
