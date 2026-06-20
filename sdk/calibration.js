// ═══════════════════════════════════════════════════════════════════
//  calibration.js — calibration physique caméra + visage
//
//  Toutes les distances sont en CENTIMÈTRES.
//
//  • Camera Pinhole : focal_y = (H/2) / tan(VFOV/2)
//  • FOV vertical = 63° (valeur par défaut utilisée par MediaPipe Tasks
//    pour calculer la matrice de transformation faciale).
//
//  • Ancres canoniques du visage (modèle MediaPipe canonical_face_model)
//    en cm depuis le centroïde du visage.
//
//  • Distance interpupillaire de référence : 6.3 cm (adulte moyen).
// ═══════════════════════════════════════════════════════════════════

export const CAM = {
  vfovDeg: 63,
  focal:   (h) => (h / 2) / Math.tan(63 * Math.PI / 360),  // px → cm equivalents
};

// Position du PONT NASAL (sellion, entre les yeux) dans le repère
// CANONIQUE du visage MediaPipe (origine = centre du visage, axes
// +X droite, +Y haut, +Z vers la caméra). Approximation moyenne.
export const ANCHORS = {
  sellion:     { x:  0.00, y:  1.00, z:  6.00 },   // pont nasal
  rightEar:    { x: -7.50, y: -0.50, z: -0.50 },   // tragus oreille droite
  leftEar:     { x:  7.50, y: -0.50, z: -0.50 },   // tragus oreille gauche
  rightTemple: { x: -7.00, y:  1.50, z:  2.50 },   // tempe droite
  leftTemple:  { x:  7.00, y:  1.50, z:  2.50 },   // tempe gauche
};

export const REFERENCE_PD_CM = 6.30;

// ───────────────────────────────────────────────────────────────────
//  Projection sténopé : landmark image (0..1) → point 3D à profondeur Z
//  À profondeur |Z| cm devant la caméra, le demi-champ est :
//    halfH = |Z| × tan(VFOV/2)
//    halfW = halfH × aspect
// ───────────────────────────────────────────────────────────────────
export function unprojectLandmark(lm, depthCm, aspect, vfovDeg = CAM.vfovDeg) {
  const halfH = Math.abs(depthCm) * Math.tan(vfovDeg * Math.PI / 360);
  const halfW = halfH * aspect;
  return {
    x:  (lm.x - 0.5) * 2 * halfW,
    y: -(lm.y - 0.5) * 2 * halfH,
    z:  depthCm,
  };
}

// ───────────────────────────────────────────────────────────────────
//  Distance inter-pupillaire (en cm) à partir des centres d'iris
//  Nécessite refineLandmarks (468 = iris D, 473 = iris G)
// ───────────────────────────────────────────────────────────────────
export function measurePdCm(landmarks, depthCm, imgW, imgH, vfovDeg = CAM.vfovDeg) {
  const l = landmarks[468], r = landmarks[473];
  if (!l || !r) return null;
  const dxPx = (r.x - l.x) * imgW;
  const dyPx = (r.y - l.y) * imgH;
  const pdPx = Math.sqrt(dxPx*dxPx + dyPx*dyPx);
  // Largeur image en cm à cette profondeur :
  const halfH = Math.abs(depthCm) * Math.tan(vfovDeg * Math.PI / 360);
  const halfW = halfH * (imgW / imgH);
  const cmPerPx = (2 * halfW) / imgW;
  return pdPx * cmPerPx;
}

// ───────────────────────────────────────────────────────────────────
//  Décomposition d'une matrice 4×4 MediaPipe en {T, q, S}
//  La matrice MP est column-major, translation en cm, rotation pure.
//  Convention coords : +X droite, +Y haut, +Z vers caméra (identique
//  à Three.js). Translation : la caméra est à l'origine, +Z s'éloigne
//  de la caméra dans Three.js → on inverse Z pour rendre la tête
//  DEVANT la caméra (Z négatif).
// ───────────────────────────────────────────────────────────────────
export function decomposeMpMatrix(mat4Array, THREE) {
  const m = new THREE.Matrix4().fromArray(mat4Array);
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(t, q, s);
  // Convention Three.js : devant caméra = Z négatif
  t.z = -Math.abs(t.z);
  return { t, q, s, matrix: m };
}
