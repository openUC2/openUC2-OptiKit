/**
 * WP-76: the unbind verb — take the optic OUT of the cube. The exact inverse
 * of WP-61's "generate a holder…" (primitive → cube): the placed part is
 * re-pointed from its cube module at the module's optical COMPONENT, at the
 * same pose, in ONE undo step. The module record itself is untouched — only
 * the placement changes. From then on the part behaves as a WP-60 unbound
 * primitive (continuous mm movement, no grid claim, DRC-invisible, UNBOUND
 * badge) until a holder is generated around it again.
 *
 * The heavy lifting is WP-66's `swapPartModule`: unbinding IS a swap whose
 * target is `module.component.ref` minus the `@range` — path chains survive
 * where the component declares the same port names, and template-bound DOF
 * values are dropped (the bare component declares none) and reported.
 */

import { libraryEntryOf } from './libraryPalette';
import { getPart } from './OptikitDocument';
import { swapPartModule, type SwapResult } from './swap';

export type UnbindOutcome =
  | ({ ok: true; componentId: string } & SwapResult)
  | { ok: false; message: string };

/** Re-point `partId` from its cube module at the module's bare component. */
export function unbindPart(partId: string): UnbindOutcome {
  const part = getPart(partId);
  if (!part) return { ok: false, message: `unknown part: ${partId}` };
  const entry = libraryEntryOf(part.libraryRef);
  if (!entry) {
    return {
      ok: false,
      message: `${part.libraryRef} is not a registered library module — nothing to unbind`,
    };
  }
  if (entry.unbound) {
    return {
      ok: false,
      message: `${part.ref} is already a free primitive — there is no cube to take it out of`,
    };
  }
  const componentId = entry.componentId;
  if (!componentId) {
    return {
      ok: false,
      message: `${part.libraryRef} binds no optical component — there is no optic to take out`,
    };
  }
  if (!libraryEntryOf(componentId)) {
    // The WP-68 archive sweep can leave a module whose component ref no
    // longer resolves in the live index — same hint as E_ARCHIVED.
    return {
      ok: false,
      message:
        `the module's component ${componentId} does not resolve in the index — ` +
        `it may be archived (restore it from library/archive/ to unbind)`,
    };
  }
  const swap = swapPartModule(partId, componentId);
  if (!swap) {
    return { ok: false, message: `unbinding ${part.ref} changed nothing` };
  }
  return { ok: true, componentId, ...swap };
}
