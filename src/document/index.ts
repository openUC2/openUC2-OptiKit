/**
 * The document boundary. Editor components import ONLY from here — never from
 * `stores/appStore` directly (see CLAUDE.md).
 */

export * from './types';
export {
  addPart,
  captureUndo,
  categoryOf,
  clearDofValue,
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
  repointPartLibraryRef,
  renderInfoOf,
  rotatePart,
  selectPart,
  setDofValue,
  setPartOrientation,
  setPath,
  subscribe,
  tiltPart,
  undo,
  useDocPart,
  useDocParts,
  useDocPaths,
  useSelectedPartId,
} from './OptikitDocument';
export type { PartRenderInfo, UndoToken } from './OptikitDocument';
export { setPartParam } from './OptikitDocument';
export {
  activeWavelengthUm,
  isSourceOn,
  setActiveWavelengthUm,
  setSourceOn,
} from './OptikitDocument';
export { buildDocBom, docBomCsv } from './bom';
export type { DocBom, DocBomLine } from './bom';
export { addGroup, groupInstanceOf, ungroupInstance } from './OptikitDocument';
export type { AddGroupResult } from './OptikitDocument';
export { useGroupEditStore, isGroupLocked } from './groupStore';
export {
  addFiber,
  defaultFiber,
  fibersOfPart,
  listFibers,
  removeFiber,
  updateFiber,
  useFibersStore,
} from './fibersStore';
export type { DocFiber, FiberType } from './fibersStore';
export {
  DEFAULT_LIB_ROT,
  LIBRARY_GROUP,
  isLibraryModule,
  T_CLASS_LABEL,
  defaultRotationFor,
  docCategoryOfRecord,
  entriesFromComponents,
  entriesFromIndex,
  entriesFromWorkspace,
  libraryEntryOf,
  listLibraryEntries,
  registerLibraryModules,
  registerLibraryGroups,
  groupEntriesFromIndex,
  groupEntryOf,
  interfaceKindOf,
  listLibraryGroups,
  templateClassOf,
} from './libraryPalette';
export type { InterfaceKind, LibraryDof, LibraryGroupEntry, LibraryPaletteEntry, TemplateClass } from './libraryPalette';
export {
  DOC_PARAMS_KEY,
  docPosToThree,
  docQuatToThree,
  docYawFromStoreYaw,
  eulerTripleForRot24,
  offsetDegMatrix,
  offsetDegOf,
  rotateDocVec,
  threePosToDoc,
  joinWorldPosition,
  normalizeDeg,
  splitDocYaw,
  splitWorldPosition,
  storeYawFromDocYaw,
} from './mapping';
export type { OffsetDeg } from './mapping';
export { AXIS_DIRS, decomposeRot24, rot24Matrix } from './rot24';
export type { AxisDir, Rot24 } from './rot24';
export {
  componentKeyOf,
  partIdOfComponent,
  sourcePortsOf,
  useSourceDesignStore,
} from './sourceDesignStore';
export type { SourcePort, SourceProvenance } from './sourceDesignStore';
export { swapPartModule } from './swap';
export type { SwapResult } from './swap';
export { unbindPart } from './unbind';
export type { UnbindOutcome } from './unbind';
export { copyPart, duplicatePart, pastePart, removePartUndoable, uniquifiedRef } from './clipboard';
export type { PartClipboard } from './clipboard';
export {
  listSelectedPartIds,
  setSelectedParts,
  togglePartSelection,
  useSelectedPartIds,
} from './OptikitDocument';
export {
  ADHOC_PREFIX,
  groupNameOf,
  groupParts,
  groupRecordYaml,
  isAdhocGroup,
  partsOfGroupInstance,
  renameGroup,
  ungroupParts,
} from './adhocGroup';
export type { GroupRecordDraft, GroupResult } from './adhocGroup';
export { getDocRevision, useDocRevision } from './revision';
export { classifyPart, layerOf, layerRangeOf } from './layers';
export type { LayerClassification, LayerRange } from './layers';
export { layerAppearance, useLayerStore } from './layerStore';
export type { LayerAppearance, LayerOverride } from './layerStore';
