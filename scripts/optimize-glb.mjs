/**
 * GLB Optimization + Calibration Pipeline
 * Usage: node scripts/optimize-glb.mjs
 *
 * For each model:
 *  1. Load raw GLB
 *  2. Flatten root node transform (fix 90° rotation)
 *  3. Normalize scale so frame width ≈ 0.14 units
 *  4. Center pivot at nose bridge
 *  5. Compress textures (WebP 512×512 max)
 *  6. Write optimized GLB
 *  7. Output glasses_config.json with calibration per model
 */

import { NodeIO, Scene } from '@gltf-transform/core';
import {
  resample, prune, dedup, flatten,
  textureCompress, metalRough,
} from '@gltf-transform/functions';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MODELS = [
  { src: '3dmodel/classic/model_raw.glb',   out: '3dmodel/classic/model.glb',   name: 'Classic',    id: 'classic'   },
  { src: '3dmodel/noir/model_raw.glb',      out: '3dmodel/noir/model.glb',      name: 'Noir',       id: 'noir'      },
  { src: '3dmodel/glasses11/model_raw.glb', out: '3dmodel/glasses11/model.glb', name: 'Glasses 11', id: 'glasses11' },
  { src: '3dmodel/glasses12/model_raw.glb', out: '3dmodel/glasses12/model.glb', name: 'Glasses 12', id: 'glasses12' },
  { src: '3dmodel/glasses13/model_raw.glb', out: '3dmodel/glasses13/model.glb', name: 'Glasses 13', id: 'glasses13' },
];

// Target frame width in meters (= 0.14 units for 14 cm physique)
// MediaPipe interpupillary space convention : nos modèles utilisent 14 cm
const TARGET_FRAME_WIDTH_M = 0.14;

const io = new NodeIO();

function getBoundingBox(doc) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, []);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
           size: [maxX-minX, maxY-minY, maxZ-minZ],
           center: [(minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2] };
}

async function processModel(cfg) {
  console.log(`\n━━━ ${cfg.name} (${cfg.src}) ━━━`);
  const srcPath = join(ROOT, cfg.src);
  const outPath = join(ROOT, cfg.out);

  const doc = await io.read(srcPath);
  const root = doc.getRoot();

  // ── 1. Flatten root transforms (fix 90° rotation from DCC exporters) ──
  await doc.transform(flatten());
  await doc.transform(dedup());
  await doc.transform(prune());

  // ── 2. Reset all root node transforms explicitly ──
  for (const node of root.listNodes()) {
    if (!node.getParentNode()) {          // top-level nodes only
      node.setTranslation([0, 0, 0]);
      node.setScale([1, 1, 1]);
      // Keep rotation only if non-identity; clear 90° flips
      const r = node.getRotation();
      // Detect 90° rotations (quaternion components ≈ ±0.707 or ±1)
      const isFlipped = Math.abs(Math.abs(r[0]) - 0.707) < 0.05
                     || Math.abs(Math.abs(r[1]) - 0.707) < 0.05
                     || Math.abs(Math.abs(r[2]) - 0.707) < 0.05;
      if (isFlipped) {
        console.log(`  → Clearing malformed root rotation: [${r.map(v=>v.toFixed(3)).join(', ')}]`);
        node.setRotation([0, 0, 0, 1]);
      }
    }
  }

  // ── 3. Measure bounding box (before scale normalization) ──
  let bb = getBoundingBox(doc);
  console.log(`  BBox native : X=${bb.size[0].toFixed(4)} Y=${bb.size[1].toFixed(4)} Z=${bb.size[2].toFixed(4)}`);

  // ── 4. Normalize scale so frame width (X axis) = TARGET_FRAME_WIDTH_M ──
  const rawWidth = bb.size[0];
  const scaleFactor = rawWidth > 0.001 ? TARGET_FRAME_WIDTH_M / rawWidth : 1;
  console.log(`  Scale factor: ${scaleFactor.toFixed(6)}`);

  // Apply scale to all root nodes
  for (const node of root.listNodes()) {
    if (!node.getParentNode()) {
      const cur = node.getScale();
      node.setScale([cur[0]*scaleFactor, cur[1]*scaleFactor, cur[2]*scaleFactor]);
    }
  }

  // ── 5. Re-measure after scaling ──
  // Approximate: multiply previous bb by scaleFactor
  const scaledSize  = bb.size.map(v => v * scaleFactor);
  const scaledCenter= bb.center.map(v => v * scaleFactor);

  console.log(`  BBox scaled : X=${scaledSize[0].toFixed(4)} Y=${scaledSize[1].toFixed(4)} Z=${scaledSize[2].toFixed(4)}`);

  // ── 6. Center pivot at nose bridge ──
  // Nose bridge = center-X, lower-quarter-Y, front-most-Z
  const bridgeY = (bb.min[1] * scaleFactor) + scaledSize[1] * 0.25;  // 25% from bottom
  const bridgeX = scaledCenter[0];
  const bridgeZ = (bb.max[2] * scaleFactor);  // front face

  for (const node of root.listNodes()) {
    if (!node.getParentNode()) {
      const t = node.getTranslation();
      node.setTranslation([
        t[0] - bridgeX,
        t[1] - bridgeY,
        t[2] - bridgeZ,
      ]);
    }
  }

  console.log(`  Bridge pivot: x=${(-bridgeX).toFixed(4)} y=${(-bridgeY).toFixed(4)} z=${(-bridgeZ).toFixed(4)}`);

  // ── 7. Compress textures → WebP 512×512 max ──
  const texCount = root.listTextures().length;
  if (texCount > 0) {
    console.log(`  Compressing ${texCount} textures → WebP 512×512…`);
    await doc.transform(
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [512, 512],
      })
    );
  } else {
    console.log('  No textures to compress.');
  }

  await doc.transform(prune());

  // ── 8. Write output ──
  await io.write(outPath, doc);

  // Report sizes
  const srcSize = readFileSync(srcPath).length;
  const outSize = readFileSync(outPath).length;
  console.log(`  Input  : ${(srcSize/1024).toFixed(0)} KB`);
  console.log(`  Output : ${(outSize/1024).toFixed(0)} KB  (${((1-outSize/srcSize)*100).toFixed(0)}% reduction)`);

  // ── 9. Return calibration entry ──
  // After centering pivot at bridge, position/rotation corrections = 0
  // Scale is already normalized to 0.14 units width
  return {
    file: cfg.out.split('/').pop(),
    name: cfg.name,
    scaledWidth:  +scaledSize[0].toFixed(4),
    scaledHeight: +scaledSize[1].toFixed(4),
    scaledDepth:  +scaledSize[2].toFixed(4),
    // For the Three.js loader: no extra corrections needed after normalization
    scale: 1.0,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    // Bridge pivot offset (for reference / fine-tuning)
    bridge: { x: +(-bridgeX).toFixed(4), y: +(-bridgeY).toFixed(4), z: +(-bridgeZ).toFixed(4) },
    // App-level config (cm, for index.html GLASSES catalog)
    frameWidth_mm: Math.round(scaledSize[0] * 1000),  // in mm
    inputSize_KB: Math.round(srcSize/1024),
    outputSize_KB: Math.round(outSize/1024),
  };
}

// ────────────────────────────────────────────────────────────────────
const results = {};
const calibration = {};

for (const cfg of MODELS) {
  try {
    const info = await processModel(cfg);
    results[cfg.id] = info;
    calibration[cfg.id] = {
      name: info.name,
      file: info.file,
      scale: info.scale,
      position: info.position,
      rotation: info.rotation,
      bridge: info.bridge,
      frameWidth_mm: info.frameWidth_mm,
    };
  } catch (e) {
    console.error(`ERROR processing ${cfg.src}:`, e.message);
  }
}

// Write glasses_config.json
const configPath = join(ROOT, '3dmodel', 'glasses_config.json');
writeFileSync(configPath, JSON.stringify(calibration, null, 2));
console.log(`\n✓ glasses_config.json written to ${configPath}`);

// Print summary table
console.log('\n━━━ SUMMARY ━━━');
console.log('Model          W×H×D (m)              In(KB)  Out(KB)');
for (const [file, info] of Object.entries(results)) {
  console.log(
    `${info.name.padEnd(14)} ${info.scaledWidth.toFixed(3)}×${info.scaledHeight.toFixed(3)}×${info.scaledDepth.toFixed(3)}  ` +
    `  ${String(info.inputSize_KB).padStart(5)}  ${String(info.outputSize_KB).padStart(5)}`
  );
}
console.log('\nDone. Optimized GLBs ready in 3dmodel/glasses11-13/model.glb');
