// ═══════════════════════════════════════════════════════════════════
//  filters.js — One Euro Filter (Casiez, Roussel, Vogel — CHI 2012)
//
//  Filtre passe-bas adaptatif : conserve la réactivité sur mouvements
//  rapides, supprime le tremblement sur signal stable.
//
//  Usage :
//    const f = new OneEuro({ minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
//    const smoothed = f.filter(rawValue, performance.now());
// ═══════════════════════════════════════════════════════════════════

class LowPass {
  constructor() { this.y = null; }
  filter(x, alpha) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  reset() { this.y = null; }
}

export class OneEuro {
  constructor({ minCutoff = 1.0, beta = 0.05, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta      = beta;
    this.dCutoff   = dCutoff;
    this._x  = new LowPass();
    this._dx = new LowPass();
    this._lastT = null;
    this._lastX = null;
  }
  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, tMs) {
    if (this._lastT === null) {
      this._lastT = tMs;
      this._lastX = x;
      this._x.filter(x, 1);
      return x;
    }
    const dt  = Math.max(1e-3, (tMs - this._lastT) / 1000);
    const dx  = (x - this._lastX) / dt;
    const edx = this._dx.filter(dx, this._alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const y   = this._x.filter(x, this._alpha(cutoff, dt));
    this._lastT = tMs;
    this._lastX = x;
    return y;
  }
  reset() {
    this._x.reset(); this._dx.reset();
    this._lastT = null; this._lastX = null;
  }
}

// Filtre vectoriel : applique OneEuro composante par composante
export class OneEuroVec3 {
  constructor(opts) {
    this.x = new OneEuro(opts);
    this.y = new OneEuro(opts);
    this.z = new OneEuro(opts);
  }
  filter(v, tMs) {
    return {
      x: this.x.filter(v.x, tMs),
      y: this.y.filter(v.y, tMs),
      z: this.z.filter(v.z, tMs),
    };
  }
  reset() { this.x.reset(); this.y.reset(); this.z.reset(); }
}
