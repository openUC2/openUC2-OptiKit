// DEV ONLY — generates placeholder GLB boxes for local testing.
// Run: node scripts/generate-dev-glbs.mjs
// Delete or ignore once the real GLB store has content.
import { writeFileSync, mkdirSync } from 'fs';

function align4(n) { return Math.ceil(n / 4) * 4; }

function createBoxGLB(r, g, b) {
  const positions = new Float32Array([
    -25, -25, -25,  25, -25, -25,  25,  25, -25, -25,  25, -25,
    -25, -25,  25,  25, -25,  25,  25,  25,  25, -25,  25,  25,
  ]);
  const indices = new Uint16Array([
    0, 1, 2,  0, 2, 3,
    5, 4, 7,  5, 7, 6,
    4, 0, 3,  4, 3, 7,
    1, 5, 6,  1, 6, 2,
    3, 2, 6,  3, 6, 7,
    4, 5, 1,  4, 1, 0,
  ]);

  const posLen    = positions.byteLength;           // 96
  const idxOffset = align4(posLen);                 // 96
  const idxLen    = indices.byteLength;             // 72
  const binLen    = align4(idxOffset + idxLen);     // 168

  const bin = Buffer.alloc(binLen);
  Buffer.from(positions.buffer).copy(bin, 0);
  Buffer.from(indices.buffer).copy(bin, idxOffset);

  const jsonObj = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1],
        metallicFactor: 0.1,
        roughnessFactor: 0.7,
      },
      doubleSided: true,
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-25, -25, -25], max: [25, 25, 25] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posLen, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxLen, target: 34963 },
    ],
    buffers: [{ byteLength: binLen }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const jsonPad   = align4(jsonBytes.length);
  const jsonBuf   = Buffer.alloc(jsonPad, 0x20);
  jsonBytes.copy(jsonBuf);

  const total = 12 + 8 + jsonPad + 8 + binLen;
  const out   = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546C67, o); o += 4; // magic "glTF"
  out.writeUInt32LE(2,          o); o += 4; // version
  out.writeUInt32LE(total,      o); o += 4; // total length
  // JSON chunk
  out.writeUInt32LE(jsonPad,    o); o += 4;
  out.writeUInt32LE(0x4E4F534A, o); o += 4; // "JSON"
  jsonBuf.copy(out, o);              o += jsonPad;
  // BIN chunk
  out.writeUInt32LE(binLen,     o); o += 4;
  out.writeUInt32LE(0x004E4942, o); o += 4; // "BIN\0"
  bin.copy(out, o);
  return out;
}

mkdirSync('public/dev-glbs', { recursive: true });
writeFileSync('public/dev-glbs/mirror-box.glb', createBoxGLB(0.65, 0.75, 0.95));
writeFileSync('public/dev-glbs/camera-box.glb', createBoxGLB(0.95, 0.60, 0.20));
writeFileSync('public/dev-glbs/empty-box.glb',  createBoxGLB(0.50, 0.82, 0.50));
console.log('Generated 3 dev GLBs in public/dev-glbs/');
