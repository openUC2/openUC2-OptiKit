/**
 * The document boundary. Editor components import ONLY from here — never from
 * `stores/appStore` directly (see CLAUDE.md).
 */

export * from './types';
export {
  addPart,
  categoryOf,
  getPart,
  getSnapshot,
  listParts,
  listPaths,
  movePartGrid,
  movePartWorld,
  removePart,
  removePath,
  renamePart,
  rotatePart,
  selectPart,
  setDofValue,
  setPartOrientation,
  setPath,
  subscribe,
  useDocPart,
  useDocParts,
  useDocPaths,
  useSelectedPartId,
} from './OptikitDocument';
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
