// ═══════════════════════════════════════════════════════════════════
//  glassesRenderer.js — chargement GLB, scaling physique en cm,
//  ancrage sur le pont nasal, teinte des verres.
//
//  Le GLB est mis à l'échelle pour que sa largeur physique
//  corresponde à cfg.mm.frameWidth (en mm → cm).
//  Le modèle est translaté pour que le PONT NASAL (au sommet de la
//  monture, ≈30% depuis le haut de la bounding box) soit à l'origine
//  du groupe parent. Le groupe sera ensuite positionné/orienté par
//  le module tracking.
// ═══════════════════════════════════════════════════════════════════
import * as THREE       from 'three';
import { GLTFLoader }   from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class GlassesRenderer {
  constructor({ canvas, width, height }) {
    this.canvas = canvas;
    this.W = width; this.H = height;
    this._initRenderer();
    this._initScene();
    this.group  = null;
    this.config = null;
  }

  _initRenderer() {
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0, 0);
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.sortObjects = true;
    this.renderer.outputEncoding      = THREE.sRGBEncoding;
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const k = new THREE.DirectionalLight(0xfff5e0, 1.4); k.position.set(0, 30, 40); this.scene.add(k);
    const f = new THREE.DirectionalLight(0xe0ecff, 0.6); f.position.set(-40, 10, 20); this.scene.add(f);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Caméra : FOV vertical 63° pour matcher MediaPipe
    this.camera = new THREE.PerspectiveCamera(63, this.W / this.H, 1, 500);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
  }

  add(object3D) { this.scene.add(object3D); }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  // ───────────────────────────────────────────────────────────────
  //  Chargement GLB : remplace le modèle courant
  //  cfg : { path, model, mm:{frameWidth,lensWidth,bridgeWidth,templeLength},
  //          rotFix:[x,y,z], yFix(mm) }
  // ───────────────────────────────────────────────────────────────
  async loadGlass(cfg) {
    if (this.group) { this.scene.remove(this.group); this._disposeGroup(this.group); this.group = null; }

    const loader = new GLTFLoader();
    loader.setPath(cfg.path);
    const gltf = await new Promise((res, rej) => loader.load(cfg.model, res, undefined, rej));
    const model = gltf.scene;

    if (cfg.rotFix?.some(v => v)) model.rotation.set(...cfg.rotFix);
    model.updateMatrixWorld(true);

    // 1. Largeur native du modèle
    const box0 = new THREE.Box3().setFromObject(model);
    const sz0  = box0.getSize(new THREE.Vector3());

    // 2. Échelle pour atteindre frameWidth physique en cm
    const targetCm = cfg.mm.frameWidth / 10;
    const s = targetCm / (sz0.x || 1);
    model.scale.set(s, s, s);
    model.updateMatrixWorld(true);

    // 3. Ancrage pont nasal : sommet de la monture (≈30% depuis le haut)
    //    yFix (mm) permet un ajustement fin par monture.
    const box1    = new THREE.Box3().setFromObject(model);
    const sz1     = box1.getSize(new THREE.Vector3());
    const center1 = box1.getCenter(new THREE.Vector3());
    const bridgeY = box1.max.y - sz1.y * 0.30;
    model.position.set(
      -center1.x,
      -bridgeY + (cfg.yFix || 0) / 10,
      -center1.z
    );

    // Groupe parent : sa MATRICE sera pilotée par le tracker
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.renderOrder      = 1;
    group.add(model);
    this.scene.add(group);
    this.group  = group;
    this.config = cfg;

    // Sauvegarder matériaux originaux + ajouter plans de verres teintés
    model.traverse(n => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(m => {
        if (!m || m.userData.saved) return;
        m.userData.origColor = m.color?.clone();
        m.userData.saved     = true;
      });
    });
    this._addTintPlanes(group, cfg);
  }

  // Pose la matrice 4×4 (cm) sur le groupe lunettes
  applyPose(t, q, scale) {
    if (!this.group) return;
    const s = new THREE.Vector3(scale, scale, scale);
    this.group.matrix.compose(t, q, s);
    this.group.matrixWorldNeedsUpdate = true;
  }

  _addTintPlanes(group, cfg) {
    const lensR = cfg.mm.lensWidth / 10 / 2;
    const lensH = lensR * 0.62;
    const dx    = (cfg.mm.lensWidth + cfg.mm.bridgeWidth) / 10 / 2;
    const geo   = new THREE.EllipseGeometry(lensR, lensH, 48);
    [-dx, dx].forEach(x => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x808080, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0, 0.2);
      mesh.userData.isTint = true;
      group.add(mesh);
    });
  }

  setTint(color, alpha) {
    if (!this.group) return;
    this.group.traverse(n => {
      if (!n.userData.isTint) return;
      if (color) n.material.color.setStyle(color);
      n.material.opacity     = alpha;
      n.material.needsUpdate = true;
    });
  }

  _disposeGroup(group) {
    group.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach(m => m.dispose());
      }
    });
  }

  dispose() {
    if (this.group) { this.scene.remove(this.group); this._disposeGroup(this.group); }
    this.renderer.dispose();
    this.group = null;
  }
}
