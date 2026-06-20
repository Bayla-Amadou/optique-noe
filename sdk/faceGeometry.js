// ═══════════════════════════════════════════════════════════════════
//  faceGeometry.js — wrapper MediaPipe Tasks Vision FaceLandmarker
//
//  Encapsule l'initialisation, le mode VIDEO, et le polling vidéo.
//  Fournit à chaque frame :
//    • faceLandmarks[0]                  478 points (0..1) avec iris
//    • facialTransformationMatrixes[0]   matrice 4×4 colonne, en cm
// ═══════════════════════════════════════════════════════════════════
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceGeometry {
  constructor() {
    this.landmarker    = null;
    this.lastVideoTime = -1;
    this.lastResult    = null;
  }

  async init({ delegate = 'GPU' } = {}) {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      outputFaceBlendshapes:              false,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces:    1,
    });
  }

  // Renvoie le résultat si la vidéo a une nouvelle frame, sinon null
  process(videoEl, tMs = performance.now()) {
    if (!this.landmarker || videoEl.readyState < 2) return null;
    if (videoEl.currentTime === this.lastVideoTime)  return this.lastResult;
    this.lastVideoTime = videoEl.currentTime;
    const r = this.landmarker.detectForVideo(videoEl, tMs);
    if (r.faceLandmarks?.length && r.facialTransformationMatrixes?.length) {
      this.lastResult = {
        landmarks: r.faceLandmarks[0],
        matrix:    r.facialTransformationMatrixes[0].data,
        raw:       r,
      };
    } else {
      this.lastResult = null;
    }
    return this.lastResult;
  }

  dispose() {
    if (this.landmarker) {
      try { this.landmarker.close(); } catch (_) {}
      this.landmarker = null;
    }
    this.lastResult    = null;
    this.lastVideoTime = -1;
  }
}
