/**
 * WP-105: one gate in front of every path that REPLACES the open document.
 *
 * Seven doors led to "your design is gone" and only two of them asked first:
 * the `.dsn` zip import, a share link, "Import from URL", loading a published
 * setup, opening a community design — and, worst, two URL parameters
 * (`?layout=` and `?data=`) handled in the router root, so they fire on page
 * load on ANY route, including the parts editor. A user who opened a shared
 * link in the tab they were working in lost the work with no prompt.
 *
 * The rule: replacing an EMPTY document needs no ceremony; replacing one with
 * parts in it asks, and says what is about to be lost.
 */

import { useDocumentStore } from './documentStore';

/** How many parts the open document holds (0 = nothing to lose). */
export function openPartCount(): number {
  return useDocumentStore.getState().parts.length;
}

/**
 * True when it is safe to proceed — either the document is empty, or the user
 * said yes. `source` names what is about to replace it, in the user's words
 * ("the shared link", "demo-bench.dsn.zip").
 *
 * `confirm` is deliberate: this must block, it fires from non-React contexts
 * (a URL parameter handler at page load), and it is the same primitive the
 * clear-all verb already uses.
 */
export function confirmReplaceDocument(source: string): boolean {
  const count = openPartCount();
  if (count === 0) return true;
  return confirm(
    `Opening ${source} replaces the design you have open ` +
      `(${count} part${count === 1 ? '' : 's'}).\n\n` +
      'That cannot be undone. Export it first if you want to keep it.\n\n' +
      'Replace it?',
  );
}
