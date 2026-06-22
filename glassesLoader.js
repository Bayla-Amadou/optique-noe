/**
 * glassesLoader.js
 * ES module — loads a GLB + applies calibration from glasses_config.json.
 * Usage:
 *   import { loadGlassesModel } from './glassesLoader.js';
 *   const model = await loadGlassesModel(scene, '3dmodel/glasses11/model.glb', 'glasses11', gltfLoader, THREE);
 */

let _config = null;

async function fetchConfig(configPath = '3dmodel/glasses_config.json') {
  if (_config) return _config;
  const res = await fetch(configPath);
  if (!res.ok) throw new Error(`glasses_config.json not found at ${configPath}`);
  _config = await res.json();
  return _config;
}

/**
 * Load a calibrated glasses GLB into the scene.
 *
 * @param {THREE.Scene}       scene      - Three.js scene
 * @param {string}            glbPath    - Path to the .glb file
 * @param {string}            modelId    - Key in glasses_config.json (e.g. 'glasses11')
 * @param {GLTFLoader}        loader     - Instantiated GLTFLoader
 * @param {THREE}             THREE      - Three.js namespace
 * @param {object}            [opts]
 * @param {number}            [opts.targetCm=14]   - Target frame width in cm
 * @param {number[]}          [opts.rotFix=[0,0,0]] - Extra Euler rotation in radians [x,y,z]
 * @param {number}            [opts.yFix=0]         - Extra Y offset in cm
 * @returns {Promise<THREE.Group>} The loaded, calibrated group
 */
export async function loadGlassesModel(scene, glbPath, modelId, loader, THREE, opts = {}) {
  const {
    targetCm = 14,
    rotFix = [0, 0, 0],
    yFix = 0,
  } = opts;

  const config = await fetchConfig();
  const cal = config[modelId] || { scale: 1, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };

  const gltf = await new Promise((resolve, reject) => {
    loader.load(glbPath, resolve, undefined, reject);
  });

  const model = gltf.scene;

  // Bounding box → uniform scale so frame width = targetCm
  const box = new THREE.Box3().setFromObject(model);
  const s0 = new THREE.Vector3();
  box.getSize(s0);
  const sc = s0.x > 0.001 ? targetCm / s0.x : 1;
  model.scale.setScalar(sc * cal.scale);

  // Calibration position offset (convert meters → cm if needed, config in meters)
  model.position.set(
    cal.position.x * 100 + 0,
    cal.position.y * 100 + yFix,
    cal.position.z * 100 + 0
  );

  // Calibration rotation
  model.rotation.set(
    cal.rotation.x + rotFix[0],
    cal.rotation.y + rotFix[1],
    cal.rotation.z + rotFix[2]
  );

  // Material: force FrontSide, depth correct, renderOrder=2
  model.traverse(n => {
    if (!n.isMesh) return;
    n.renderOrder = 2;
    n.frustumCulled = false;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mats.forEach(m => {
      if (!m) return;
      m.side = THREE.FrontSide;
      m.depthWrite = true;
      m.depthTest = true;
      m.needsUpdate = true;
    });
  });

  return model;
}

/**
 * Convenience: load a GLASSES catalog entry (same shape as used in index.html).
 *
 * @param {object}  g       - GLASSES[i] entry with .path, .id, .yFix, .rotFix
 * @param {object}  deps    - { scene, loader, THREE }
 * @returns {Promise<THREE.Group>}
 */
export async function loadCatalogEntry(g, { scene, loader, THREE }) {
  return loadGlassesModel(scene, g.path, g.id, loader, THREE, {
    yFix: (g.yFix || 0) / 10,   // yFix stored in mm → convert to cm
    rotFix: g.rotFix || [0, 0, 0],
  });
}
