// ═══════════════════════════════════════════════════════════════════
//  noaSDK.js — Point d'entrée du SDK AR Lunettes N.O.A
//
//  Orchestre :
//    • FaceGeometry      (MediaPipe Tasks Vision)
//    • HeadTracker       (matrice 4×4 + ancrage canonique + filtres)
//    • GlassesRenderer   (Three.js, GLB, scaling cm, teinte)
//    • FaceOcclusion     (depth mesh)
//
//  API publique :
//    const sdk = new NoaSDK({ video, canvas, width, height });
//    await sdk.init();
//    await sdk.setGlasses(cfg);
//    sdk.setTint(color, alpha);
//    sdk.onStatus = (state) => …    // 'searching' | 'tracking' | 'lost'
//    sdk.start();   sdk.stop();   sdk.capture() → dataURL;
// ═══════════════════════════════════════════════════════════════════
import { FaceGeometry }    from './faceGeometry.js';
import { HeadTracker }     from './tracking.js';
import { GlassesRenderer } from './glassesRenderer.js';
import { FaceOcclusion }   from './occlusion.js';

export class NoaSDK {
  constructor({ video, canvas, width = 640, height = 480 }) {
    this.video  = video;
    this.canvas = canvas;
    this.W = width; this.H = height;

    this.geom      = new FaceGeometry();
    this.tracker   = new HeadTracker({ imgW: width, imgH: height });
    this.renderer  = new GlassesRenderer({ canvas, width, height });
    this.occlusion = new FaceOcclusion();
    this.renderer.add(this.occlusion.mesh);

    this.onStatus    = () => {};
    this._animId     = null;
    this._state      = 'idle';
  }

  async init() {
    this._setState('searching');
    await this.geom.init();
  }

  async setGlasses(cfg) {
    await this.renderer.loadGlass(cfg);
  }

  setTint(color, alpha) {
    this.renderer.setTint(color, alpha);
  }

  start() {
    if (this._animId) return;
    const loop = () => {
      this._animId = requestAnimationFrame(loop);
      this._frame();
    };
    loop();
  }

  stop() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    this.geom.dispose();
    this.tracker.reset();
    this.occlusion.dispose();
    this.renderer.dispose();
    this._setState('idle');
  }

  capture() {
    const out = document.createElement('canvas');
    out.width = this.W; out.height = this.H;
    const ctx = out.getContext('2d');
    ctx.save();
    ctx.translate(this.W, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video,  0, 0, this.W, this.H);
    ctx.drawImage(this.canvas, 0, 0, this.W, this.H);
    ctx.restore();
    return out.toDataURL('image/png');
  }

  // ─────────────────────────────────────────────────────────────
  _frame() {
    const res = this.geom.process(this.video);
    if (res) {
      const pose = this.tracker.track(res.landmarks, res.matrix);
      if (pose) {
        this.renderer.applyPose(pose.t, pose.q, pose.scale);
        this.occlusion.update(res.landmarks, pose.headDepthCm, this.W / this.H);
        this._setState('tracking');
      }
    } else if (this._state !== 'searching') {
      this.occlusion.hide();
      this.tracker.reset();
      this._setState('lost');
    }
    this.renderer.render();
  }

  _setState(s) {
    if (s === this._state) return;
    this._state = s;
    this.onStatus(s);
  }
}
