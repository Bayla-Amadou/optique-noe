// ═══════════════════════════════════════════════════════════════════
//  tracking.js — 6DOF Head Tracker
//
//  Combine la MATRICE 4×4 MediaPipe (rotation pure, translation cm)
//  avec un ANCRAGE LOCAL au pont nasal (canonical face model) pour
//  obtenir une pose stable jusqu'à 90° de rotation.
//
//  Pipeline par frame :
//    1. Décomposer la matrice MP → (T_head, q_head)
//    2. Ancre canonique sellion = (0, 1, 6) cm transformée par q_head
//    3. Position lunettes = T_head + (q_head × ancre)
//    4. Échelle = PD réelle (iris) / PD référence (6.3 cm)
//    5. One Euro Filter sur tx/ty/tz, yaw/pitch/roll, scale
//    6. Recomposer la matrice et la pousser au GlassesRenderer
//
//  AUCUN plafonnement angulaire : yaw / pitch / roll passent tels quels.
// ═══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { OneEuro } from './filters.js';
import { ANCHORS, REFERENCE_PD_CM, measurePdCm, decomposeMpMatrix } from './calibration.js';

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class HeadTracker {
  constructor({ imgW, imgH } = {}) {
    this.imgW = imgW;
    this.imgH = imgH;
    this.aspect = imgW / imgH;

    // Filtres adaptatifs : cutoff bas = stable, beta haut = réactif
    this.f = {
      tx:  new OneEuro({ minCutoff: 1.5, beta: 0.05 }),
      ty:  new OneEuro({ minCutoff: 1.5, beta: 0.05 }),
      tz:  new OneEuro({ minCutoff: 1.0, beta: 0.02 }),
      yaw: new OneEuro({ minCutoff: 1.5, beta: 0.08 }),
      pit: new OneEuro({ minCutoff: 1.5, beta: 0.08 }),
      rol: new OneEuro({ minCutoff: 2.0, beta: 0.10 }),
      sc:  new OneEuro({ minCutoff: 0.6, beta: 0.005 }),
    };

    this.lastPose = null;
  }

  reset() {
    Object.values(this.f).forEach(f => f.reset());
    this.lastPose = null;
  }

  // Renvoie { t: Vector3, q: Quaternion, scale, headDepthCm } ou null
  track(landmarks, mat4Array, tMs = performance.now()) {
    const { t: tHead, q: qHead } = decomposeMpMatrix(mat4Array, THREE);

    // ── Ancrage canonique : sellion en repère monde ───────────────
    const a = ANCHORS.sellion;
    _v.set(a.x, a.y, a.z).applyQuaternion(qHead);
    const tx = tHead.x + _v.x;
    const ty = tHead.y + _v.y;
    const tz = tHead.z - _v.z;     // canonique +Z = vers caméra, monde -Z

    // ── Rotation : Euler YXZ depuis quaternion, AUCUN clamp ──────
    _e.setFromQuaternion(qHead, 'YXZ');
    const yaw   = _e.y;
    const pitch = _e.x;
    const roll  = _e.z;

    // ── Échelle physique : PD réelle / PD référence ──────────────
    let scaleFactor = 1.0;
    const pdCm = measurePdCm(landmarks, tHead.z, this.imgW, this.imgH);
    if (pdCm && isFinite(pdCm) && pdCm > 3 && pdCm < 10) {
      scaleFactor = pdCm / REFERENCE_PD_CM;
    }

    // ── One Euro Filter ──────────────────────────────────────────
    const fx  = this.f.tx.filter(tx,           tMs);
    const fy  = this.f.ty.filter(ty,           tMs);
    const fz  = this.f.tz.filter(tz,           tMs);
    const fya = this.f.yaw.filter(yaw,         tMs);
    const fpi = this.f.pit.filter(pitch,       tMs);
    const fro = this.f.rol.filter(roll,        tMs);
    const fsc = this.f.sc.filter(scaleFactor,  tMs);

    // ── Recomposition ────────────────────────────────────────────
    _q.setFromEuler(new THREE.Euler(fpi, fya, fro, 'YXZ'));
    const t = new THREE.Vector3(fx, fy, fz);

    this.lastPose = {
      t,
      q: _q.clone(),
      scale: fsc,
      headDepthCm: fz,
      rawYaw: yaw,
    };
    return this.lastPose;
  }
}
