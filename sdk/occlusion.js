// ═══════════════════════════════════════════════════════════════════
//  occlusion.js — Face Occlusion Mesh
//
//  Mesh fermé du contour facial, écrit dans le depth buffer mais pas
//  dans le color buffer. Les parties de la monture passant DERRIÈRE
//  la tête (branches en profil) sont automatiquement masquées par
//  test de profondeur.
//
//  Chaque vertex est projeté à sa VRAIE profondeur 3D, en combinant :
//    • la profondeur de la tête (matrice MP, en cm)
//    • la profondeur RELATIVE du landmark (lm.z, normalisé)
//
//  Triangulation en éventail depuis le centroïde du contour.
// ═══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { CAM } from './calibration.js';

// FACE_OVAL (36 pts) + extensions tempes/oreilles pour mieux occulter
// les branches en vue profil.
const OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58,  132, 93,  234, 127, 162, 21,  54,  103, 67,  109,
];
const N    = OVAL.length;
const VC   = N + 1;                       // contour + centroïde

const INDICES = (() => {
  const arr = [];
  for (let i = 0; i < N; i++) arr.push(N, i, (i+1) % N);
  return new Uint32Array(arr);
})();

export class FaceOcclusion {
  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.renderOrder = 0;            // AVANT les lunettes (order=1)
    this.mesh.visible     = false;
    this.mesh.frustumCulled = false;
    this._buf = new Float32Array(VC * 3);
    this._init = false;
  }

  // landmarks : array de 478 points (.x, .y, .z normalisés)
  // headDepthCm : profondeur de la tête en cm (négative dans Three.js)
  // aspect : ratio largeur/hauteur de la vidéo
  update(landmarks, headDepthCm, aspect) {
    const halfH = Math.abs(headDepthCm) * Math.tan(CAM.vfovDeg * Math.PI / 360);
    const halfW = halfH * aspect;
    // Échelle Z des landmarks → cm : lm.z est dans les mêmes unités
    // que lm.x (normalisé sur la largeur image). À la profondeur Z,
    // 1 unité lm.x = 2 × halfW cm.
    const zScale = 2 * halfW;

    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) {
      const p  = landmarks[OVAL[i]];
      // Profondeur réelle de ce point : lm.z négatif = plus proche caméra
      const pz = headDepthCm - p.z * zScale;
      // Mise à l'échelle de la position image selon la profondeur réelle
      // (perspective correcte plutôt que projection sur plan moyen)
      const k  = Math.abs(pz) / Math.abs(headDepthCm);
      const px =  (p.x - 0.5) * 2 * halfW * k;
      const py = -(p.y - 0.5) * 2 * halfH * k;
      this._buf[i*3]   = px;
      this._buf[i*3+1] = py;
      this._buf[i*3+2] = pz;
      cx += px; cy += py; cz += pz;
    }
    this._buf[N*3]   = cx / N;
    this._buf[N*3+1] = cy / N;
    this._buf[N*3+2] = cz / N;

    const geo = this.mesh.geometry;
    if (!this._init) {
      geo.setAttribute('position', new THREE.BufferAttribute(this._buf.slice(), 3));
      geo.setIndex(new THREE.BufferAttribute(INDICES, 1));
      this._init = true;
    } else {
      geo.attributes.position.array.set(this._buf);
      geo.attributes.position.needsUpdate = true;
    }
    geo.computeBoundingSphere();
    this.mesh.visible = true;
  }

  hide() { this.mesh.visible = false; }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
