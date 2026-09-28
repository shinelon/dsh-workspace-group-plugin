/**
 * Pure move computation for the groups panel drag & drop. No React, no I/O —
 * the panel turns the returned plan into two existing host API calls
 * (remove-member / add-members). A `null` result means "not a move": the
 * drop target must not highlight and the drop must not be accepted.
 * @module dsh-workspace-group-manager/client/group-move
 */

/** What is being dragged: one directory path and the group it is dragged from (null = ungrouped). */
export interface GroupDrag {
  path: string
  fromGroupId: string | null
}

/** One planned move: optional remove (source) + optional add (target). */
export interface GroupMove {
  remove?: { groupId: string; path: string }
  add?: { groupId: string; path: string }
  /** Drop target for expand-after-drop; null means the ungrouped section. */
  targetGroupId: string | null
}

/**
 * Compute the move plan for dropping `drag` onto the section `targetGroupId`
 * (null = ungrouped). Returns null when the drop would be a no-op: same
 * group onto itself, ungrouped onto ungrouped, or empty drag state.
 */
export function computeGroupMove(
  drag: GroupDrag | null,
  targetGroupId: string | null,
): GroupMove | null {
  if (drag === null) return null
  const { path, fromGroupId } = drag
  if (targetGroupId === null) {
    if (fromGroupId === null) return null
    return { remove: { groupId: fromGroupId, path }, targetGroupId: null }
  }
  if (fromGroupId === targetGroupId) return null
  if (fromGroupId === null) {
    return { add: { groupId: targetGroupId, path }, targetGroupId }
  }
  return {
    remove: { groupId: fromGroupId, path },
    add: { groupId: targetGroupId, path },
    targetGroupId,
  }
}

/**
 * Whether a section header is an acceptable drop target for the active drag:
 * drives the dragover highlight (and therefore preventDefault/accept).
 */
export function isDropTarget(drag: GroupDrag | null, targetGroupId: string | null): boolean {
  return computeGroupMove(drag, targetGroupId) !== null
}
