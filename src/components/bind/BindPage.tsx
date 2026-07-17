/**
 * /configurator/bind — deep link into the unified component editor's
 * mechanics tab (WP-33). The former standalone bind workbench lives on as
 * MechanicsPanel inside the editor, so the symbol (optics) and the footprint
 * (mesh + datums) of a part are authored together as one record pair.
 */

import { ComponentEditorPage } from '../component-editor/ComponentEditorPage';

export function BindPage() {
  return <ComponentEditorPage initialTab="mechanics" />;
}
