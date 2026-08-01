/**
 * Document persistence (WP-96): the design is saved as `.dsn`-shaped parts.
 *
 * The pre-WP-96 blob stored `placedModules` (the legacy layout format) under
 * `openuc2-optikit-state`. On first load we migrate it once through
 * `legacyLayout.ts` and write the document to its own key; the legacy key
 * keeps its non-design fields (layers, metadata) for appStore.
 */

import { useDocumentStore } from './documentStore';
import { partsFromPlacedModules } from './legacyLayout';
import type { PlacedModule } from '../types';
import type { DsnPart } from './types';

export const DOCUMENT_KEY = 'openuc2-optikit-document';
export const LEGACY_STATE_KEY = 'openuc2-optikit-state';
export const DOCUMENT_SCHEMA = 'optikit-document/v1';

interface DocumentBlob {
  schema: string;
  parts: DsnPart[];
}

export function saveDocumentToStorage(): void {
  try {
    const blob: DocumentBlob = {
      schema: DOCUMENT_SCHEMA,
      parts: useDocumentStore.getState().parts,
    };
    localStorage.setItem(DOCUMENT_KEY, JSON.stringify(blob));
  } catch (error) {
    console.error('Failed to save the document:', error);
  }
}

/**
 * Load the document. Returns true when something was restored — including a
 * one-shot migration of the legacy `placedModules` blob.
 */
export function loadDocumentFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(DOCUMENT_KEY);
    if (raw) {
      const blob = JSON.parse(raw) as DocumentBlob;
      if (Array.isArray(blob?.parts)) {
        useDocumentStore.getState().replaceParts(blob.parts);
        useDocumentStore.getState().clearHistory();
        return true;
      }
    }
    return migrateLegacyDocument();
  } catch (error) {
    console.error('Failed to load the document:', error);
    return false;
  }
}

/** Read the pre-WP-96 layout out of the legacy blob, once. */
export function migrateLegacyDocument(): boolean {
  const legacy = localStorage.getItem(LEGACY_STATE_KEY);
  if (!legacy) return false;
  try {
    const parsed = JSON.parse(legacy) as { placedModules?: PlacedModule[] };
    if (!Array.isArray(parsed?.placedModules) || parsed.placedModules.length === 0) {
      return false;
    }
    useDocumentStore.getState().replaceParts(partsFromPlacedModules(parsed.placedModules));
    useDocumentStore.getState().clearHistory();
    saveDocumentToStorage();
    return true;
  } catch (error) {
    console.error('Failed to migrate the legacy layout:', error);
    return false;
  }
}
