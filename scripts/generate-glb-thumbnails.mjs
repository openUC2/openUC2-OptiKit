// Offline GLB → PNG thumbnail generator.
//
// Pre-renders every module's GLB to PNG thumbnails (several orientations each)
// and writes them to public/thumbnails/<moduleId>/<orientation>.png plus a
// public/thumbnails/manifest.json index that the app consumes at runtime.
//
//   npm i -D puppeteer        # one-time (downloads a headless Chromium)
//   node scripts/generate-glb-thumbnails.mjs                 # all modules
//   node scripts/generate-glb-thumbnails.mjs --limit 5       # first 5 (quick test)
//   node scripts/generate-glb-thumbnails.mjs --only mirror-1x1,beamsplitter-1x1
//   node scripts/generate-glb-thumbnails.mjs --size 320 --orient iso,front,top
//
// Rendering happens in a real headless Chromium (reliable WebGL) using the
// project's own three.js from node_modules, served over a tiny local HTTP
// server. GLB files are fetched from their (remote) URLs, so network access to
// the GLB store is required.
import { createServer } from 'node:http';
import { readFile, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const PUBLIC = join(ROOT, 'public');
const OUT_DIR = join(PUBLIC, 'thumbnails');
const GLB_STORE_BASE = 'https://raw.githubusercontent.com/openUC2/openUC2-OptiKit-GLBStore/main/';

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(getArg('limit', '0'), 10) || 0;
const SIZE = parseInt(getArg('size', '256'), 10) || 256;
const ONLY = (getArg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIENTATIONS = (getArg('orient', 'iso,front,top,left,right,back') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── Parse modules CSV (`;`-delimited, same as src/utils/moduleLoader.ts) ──────
function parseModules() {
  const csv = readFileSync(join(PUBLIC, 'modules_updated.csv'), 'utf8');
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(';').map(h => h.trim());
  const col = name => headers.indexOf(name);
  const ci = { id: col('id'), glb: col('glbUrl'), ox: col('glbOffsetX'), oy: col('glbOffsetY'), oz: col('glbOffsetZ') };
  const rows = [];
  for (const line of lines.slice(1)) {
    const v = line.split(';');
    const id = (v[ci.id] || '').trim();
    let glb = (v[ci.glb] || '').trim();
    if (!id || !glb) continue;
    if (!/^https?:\/\//.test(glb) && !glb.startsWith('/')) glb = GLB_STORE_BASE + glb;
    const num = i => (i >= 0 && v[i] ? parseFloat(v[i]) || 0 : 0);
    rows.push({ id, glb, offset: [num(ci.ox), num(ci.oy), num(ci.oz)] });
  }
  return rows;
}

// ── In-page renderer (runs inside headless Chromium) ──────────────────────────
const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>
</head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const DIRS = { iso:[1,0.85,1], front:[0,0,1], back:[0,0,-1], left:[-1,0,0], right:[1,0,0], top:[0,1,0.0001] };
window.__renderGLB = async (url, offset, orientations, size) => {
  // Create the GL context explicitly with failIfMajorPerformanceCaveat:false so
  // the software (SwiftShader) renderer is accepted in headless Chromium.
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const attrs = { antialias:true, alpha:true, preserveDrawingBuffer:true, failIfMajorPerformanceCaveat:false };
  const gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
  if (!gl) throw new Error('no WebGL context available in page');
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attrs });
  renderer.setSize(size, size, false); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 1.0));
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, 2, 1.5); scene.add(dl);
  const gltf = await new GLTFLoader().loadAsync(url);
  const obj = gltf.scene;
  if (offset) obj.position.set(offset[0] || 0, offset[1] || 0, offset[2] || 0);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const sz = box.getSize(new THREE.Vector3());
  const radius = Math.max(sz.x, sz.y, sz.z, 1) * 0.5;
  const fov = 35;
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 100000);
  const dist = (radius / Math.tan((fov * Math.PI / 180) / 2)) * 1.7;
  const out = {};
  for (const o of orientations) {
    const d = DIRS[o] || DIRS.iso;
    cam.position.copy(center).add(new THREE.Vector3(d[0], d[1], d[2]).normalize().multiplyScalar(dist));
    cam.up.set(0, 1, 0); cam.lookAt(center);
    renderer.render(scene, cam);
    out[o] = renderer.domElement.toDataURL('image/png');
  }
  renderer.dispose();
  return out;
};
window.__ready = true;
</script></body></html>`;

// ── Tiny static server (serves the page + node_modules/three) ─────────────────
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.wasm': 'application/wasm' };
function startServer() {
  return new Promise(res => {
    const server = createServer((req, rq) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (url === '/' || url === '/index.html') {
        rq.writeHead(200, { 'content-type': 'text/html' }); rq.end(PAGE_HTML); return;
      }
      const filePath = join(ROOT, url);
      readFile(filePath, (err, data) => {
        if (err) { rq.writeHead(404); rq.end('not found'); return; }
        rq.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
        rq.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => res(server));
  });
}

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.error('\n✖ puppeteer is not installed. Run:  npm i -D puppeteer\n');
    process.exit(1);
  }

  let modules = parseModules();
  if (ONLY.length) modules = modules.filter(m => ONLY.includes(m.id));
  if (LIMIT) modules = modules.slice(0, LIMIT);
  console.log(`Rendering ${modules.length} module(s) × ${ORIENTATIONS.length} orientation(s) at ${SIZE}px…`);

  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  // SwiftShader WebGL in headless Chromium needs these flags (it's gated behind
  // --enable-unsafe-swiftshader on recent Chromium builds).
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });

  const manifest = {};
  for (const m of modules) {
    try {
      const result = await page.evaluate(
        (url, offset, orients, size) => window.__renderGLB(url, offset, orients, size),
        m.glb, m.offset, ORIENTATIONS, SIZE,
      );
      const dir = join(OUT_DIR, m.id);
      mkdirSync(dir, { recursive: true });
      const orients = [];
      for (const [o, dataUrl] of Object.entries(result)) {
        const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        writeFileSync(join(dir, `${o}.png`), Buffer.from(b64, 'base64'));
        orients.push(o);
      }
      manifest[m.id] = orients;
      console.log(`  ✓ ${m.id} (${orients.join(', ')})`);
    } catch (e) {
      console.warn(`  ✖ ${m.id}: ${e.message}`);
    }
  }

  // Merge into an existing manifest so partial runs accumulate.
  let existing = {};
  try { existing = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8')); } catch { /* none */ }
  const merged = { ...existing, ...manifest };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(merged, null, 2));
  console.log(`\nWrote ${Object.keys(manifest).length} module(s) → ${join('public', 'thumbnails')} (manifest: ${Object.keys(merged).length} total)`);

  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
