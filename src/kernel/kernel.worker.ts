/**
 * Module worker hosting the oc-wasm ray-tracing kernel (integration spec 18.7).
 *
 * The wasm URL is passed explicitly: the app is served under the
 * `/configurator/` base, which breaks wasm-bindgen's implicit
 * `import.meta.url`-relative fetch. Messages arriving before init resolves are
 * queued and replayed, so callers may post immediately after construction.
 */

import init, { Canvas } from 'oc-wasm';
import wasmUrl from 'oc-wasm/oc_wasm_bg.wasm?url';
import { KernelCore } from './kernelCore';
import type { KernelRequest, KernelResponse } from './messages';

let core: KernelCore | null = null;
const queued: KernelRequest[] = [];

function respond(res: KernelResponse) {
  if (res.type === 'segments') {
    const transfer = [res.buffer.buffer];
    if (res.detector) transfer.push(res.detector.hits.buffer);
    postMessage(res, { transfer });
  } else {
    postMessage(res);
  }
}

self.onmessage = (event: MessageEvent<KernelRequest>) => {
  if (core) {
    respond(core.handle(event.data));
  } else {
    queued.push(event.data);
  }
};

init({ module_or_path: wasmUrl })
  .then(() => {
    core = new KernelCore(new Canvas());
    respond({ id: 0, type: 'ready' });
    for (const req of queued.splice(0)) respond(core.handle(req));
  })
  .catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    for (const req of queued.splice(0)) respond({ id: req.id, type: 'error', message });
    respond({ id: 0, type: 'error', message });
  });
