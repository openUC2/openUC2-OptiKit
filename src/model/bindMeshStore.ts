/**
 * IndexedDB persistence for bind-workbench meshes (WP-38).
 *
 * A workspace draft's STP/GLB bytes are far too big for localStorage, so the
 * mechanics tab parks them here keyed by record id — reopening a draft brings
 * its mesh back without re-uploading. Published records don't need this (their
 * mesh is fetched from the registry's asset URLs), but a local override of a
 * published record's mesh lands here too.
 */

const DB_NAME = 'optikit-bind-meshes';
const DB_VERSION = 1;
const STORE = 'meshes';

export interface StoredBindMesh {
  meshFile: string;
  glb: Uint8Array;
  step: Uint8Array | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'));
    });
  } finally {
    db.close();
  }
}

export async function saveBindMesh(recordId: string, mesh: StoredBindMesh): Promise<void> {
  await withStore('readwrite', s => s.put(mesh, recordId));
}

export async function loadBindMesh(recordId: string): Promise<StoredBindMesh | null> {
  const hit = await withStore<StoredBindMesh | undefined>('readonly', s => s.get(recordId));
  return hit && hit.glb instanceof Uint8Array && hit.glb.length > 0 ? hit : null;
}

export async function deleteBindMesh(recordId: string): Promise<void> {
  await withStore('readwrite', s => s.delete(recordId));
}
