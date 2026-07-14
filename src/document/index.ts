/**
 * The document boundary. Editor components import ONLY from here — never from
 * `stores/appStore` directly (see CLAUDE.md).
 */

export * from './types';
export {
  addPart,
  captureUndo,
  categoryOf,
  commitUndo,
  getPart,
  getSnapshot,
  listParts,
  listPaths,
  movePartGrid,
  movePartWorld,
  redo,
  removePart,
  removePath,
  renamePart,
  renderInfoOf,
  rotatePart,
  selectPart,
  setDofValue,
  setPartOrientation,
  setPath,
  subscribe,
  undo,
  useDocPart,
  useDocParts,
  useDocPaths,
  useSelectedPartId,
} from './OptikitDocument';
export type { PartRenderInfo, UndoToken } from './OptikitDocument';
export {
  DOC_PARAMS_KEY,
  docPosToThree,
  docQuatToThree,
  docYawFromStoreYaw,
  eulerTripleForRot24,
  rotateDocVec,
  threePosToDoc,
  joinWorldPosition,
  normalizeDeg,
  splitDocYaw,
  splitWorldPosition,
  storeYawFromDocYaw,
} from './mapping';
export { AXIS_DIRS, decomposeRot24, rot24Matrix } from './rot24';
export type { AxisDir, Rot24 } from './rot24';
export {
  componentKeyOf,
  partIdOfComponent,
  useSourceDesignStore,
} from './sourceDesignStore';
export type { SourceProvenance } from './sourceDesignStore';
export { getDocRevision, useDocRevision } from './revision';
