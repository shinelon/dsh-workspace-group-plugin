/**
 * 「分组」main panel: custom workspace groups rendered as a tree
 * (group → workspace directory → sessions). All data reads go through the
 * global seat hooks (useWorkspaces / useSessions); navigation goes through
 * the injected uiWorkspace wrappers; persistence goes through this plugin's
 * host routes (groupsApi). Inline styles only — no ui-primitives, no portals.
 * @module dsh-workspace-group-manager/client/panel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { groupsApi } from './api'
import type { WorkspaceGroup } from './api'
import { computeGroupMove, isDropTarget } from './group-move'
import type { GroupDrag } from './group-move'

// ---------------------------------------------------------------------------
// Structural runtime shapes (host projections; not imported at runtime).
// ---------------------------------------------------------------------------

export interface WorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: readonly string[]
  /** ISO-8601 last-mutation instant (official registry row). */
  readonly updatedAt: string
}

export interface SessionSummary {
  id: string
  displayTitle: string
  running: boolean
  blank: boolean
  updatedAt: number
  origin?: string
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

type SnapshotHook = <Selected>(selector: (snapshot: unknown) => Selected) => Selected

/** Injected face provided by the plugin body (see index.tsx). */
export interface GroupPanelInjected {
  wsg: {
    api: typeof groupsApi
    nav: {
      openSession: (sessionId: string) => void
      startSession: (workspaceId?: string) => void
    }
  }
}

export interface GroupPanelProps extends GroupPanelInjected {
  /** Global seat hooks (merged into every slot component by the framework). */
  useWorkspaces?: SnapshotHook
  useSessions?: SnapshotHook
  /** Locale seat for the register option's namespace. */
  t?: Translator
}

// ---------------------------------------------------------------------------
// Styles (inline; neutral palette that works on the dark shell).
// ---------------------------------------------------------------------------

export const S = {
  root: {
    height: '100%',
    overflowY: 'auto',
    padding: '14px 14px 24px',
    boxSizing: 'border-box',
    fontSize: 13,
    lineHeight: 1.45,
  } as const,
  head: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } as const,
  title: { fontSize: 15, fontWeight: 600, margin: 0 } as const,
  grow: { flex: 1 } as const,
  btn: {
    font: 'inherit',
    fontSize: 12,
    color: 'inherit',
    background: 'rgba(127,140,158,0.14)',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  } as const,
  btnPrimary: {
    font: 'inherit',
    fontSize: 12,
    color: '#fff',
    background: '#4d78cc',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  } as const,
  input: {
    font: 'inherit',
    fontSize: 13,
    color: 'inherit',
    background: 'rgba(127,140,158,0.12)',
    border: '1px solid rgba(127,140,158,0.4)',
    borderRadius: 6,
    padding: '4px 8px',
    outline: 'none',
    minWidth: 0,
  } as const,
  notice: {
    margin: '0 0 10px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(127,140,158,0.14)',
    color: 'inherit',
    opacity: 0.85,
  } as const,
  error: {
    margin: '0 0 10px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(196,74,74,0.18)',
    color: 'inherit',
  } as const,
  empty: {
    marginTop: 48,
    textAlign: 'center',
    opacity: 0.65,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  } as const,
  section: { marginBottom: 6 } as const,
  groupRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as const,
  groupTitle: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  count: { fontSize: 11, opacity: 0.55, flexShrink: 0 } as const,
  rowBtns: { display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto', flexShrink: 0 } as const,
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    font: 'inherit',
    fontSize: 12,
    color: 'inherit',
    opacity: 0.55,
    background: 'transparent',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    flexShrink: 0,
  } as const,
  danger: { color: '#e07a7a' } as const,
  confirmBtn: {
    font: 'inherit',
    fontSize: 11,
    color: '#e07a7a',
    background: 'rgba(196,74,74,0.16)',
    border: 'none',
    borderRadius: 5,
    padding: '2px 8px',
    cursor: 'pointer',
    flexShrink: 0,
  } as const,
  wsRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px 3px 22px',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as const,
  wsTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  badge: {
    fontSize: 10,
    padding: '0 5px',
    borderRadius: 4,
    background: 'rgba(127,140,158,0.22)',
    opacity: 0.8,
    flexShrink: 0,
  } as const,
  sessionRows: { margin: '1px 0 4px' } as const,
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 6px 2px 42px',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as const,
  sessionTitle: {
    fontSize: 12,
    opacity: 0.82,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const,
  time: { fontSize: 11, opacity: 0.45, marginLeft: 'auto', flexShrink: 0 } as const,
  dot: { width: 7, height: 7, borderRadius: 4, background: '#59b077', flexShrink: 0 } as const,
  menu: {
    position: 'absolute',
    right: 4,
    top: 'calc(100% + 2px)',
    zIndex: 31,
    minWidth: 180,
    maxWidth: 280,
    padding: 4,
    borderRadius: 8,
    background: '#23272e',
    boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
    border: '1px solid rgba(127,140,158,0.25)',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  } as const,
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' } as const,
  menuItem: {
    font: 'inherit',
    fontSize: 12,
    color: 'inherit',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderRadius: 5,
    padding: '5px 8px',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const,
  menuLabel: { fontSize: 11, opacity: 0.5, padding: '4px 8px 2px' } as const,
  separator: { height: 1, background: 'rgba(127,140,158,0.25)', margin: '3px 4px' } as const,
  dragOverHead: { outline: '2px solid #4d78cc', outlineOffset: '-2px' } as const,
  draggingRow: { opacity: 0.45 } as const,
}

const ROW_HOVER = { background: 'rgba(127,140,158,0.14)' } as const

// ---------------------------------------------------------------------------
// Tiny inline SVG glyphs.
// ---------------------------------------------------------------------------

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true"
      style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
      <path d="M2.5 1.5 8.5 5 2.5 8.5Z" fill="currentColor" />
    </svg>
  )
}

export function FolderGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.8 }}>
      <path d="M1.5 4.3c0-.99.8-1.8 1.8-1.8h3.06c.48 0 .94.2 1.27.53l1.14 1.14c.33.33.79.53 1.27.53h4.06c1 0 1.8.8 1.8 1.8v6.1c0 1-.8 1.8-1.8 1.8H3.3c-1 0-1.8-.8-1.8-1.8V4.3Z"
        stroke="currentColor" strokeWidth={1.2} />
    </svg>
  )
}

export function PlusGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  )
}

export function DotsGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
      <circle cx={2.5} cy={6} r={1.1} fill="currentColor" />
      <circle cx={6} cy={6} r={1.1} fill="currentColor" />
      <circle cx={9.5} cy={6} r={1.1} fill="currentColor" />
    </svg>
  )
}

/** Panel-list glyph: folder + group tiles. */
export function PanelIcon({ size }: { size?: number }) {
  const edge = size ?? 16
  return (
    <svg width={edge} height={edge} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 4.2c0-.94.76-1.7 1.7-1.7h2.9c.45 0 .88.18 1.2.5l1 1c.32.32.75.5 1.2.5h4.3c.94 0 1.7.76 1.7 1.7v6.6c0 .94-.76 1.7-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7V4.2Z"
        fill="currentColor" opacity={0.4} />
      <rect x={4.2} y={8.2} width={3.4} height={3} rx={0.6} fill="currentColor" />
      <rect x={8.6} y={8.2} width={3.4} height={3} rx={0.6} fill="currentColor" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Localized compact relative time, official-style ("10分钟" / "10 min"). */
export function formatRelative(
  updatedAtMs: number,
  t?: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const delta = Math.max(0, Date.now() - updatedAtMs)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return t ? t('relNow') : 'now'
  if (minutes < 60) return t ? t('relMinutes', { count: minutes }) : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t ? t('relHours', { count: hours }) : `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return t ? t('relDays', { count: days }) : `${days}d`
  const months = Math.floor(days / 30)
  return t ? t('relMonths', { count: months }) : `${months}mo`
}

export function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

/** Visible sessions of one workspace: real, non-archived, non-blank, non-subagent, newest first. */
export function visibleSessions(
  workspace: WorkspaceView,
  byId: Record<string, SessionSummary>,
  archived: ReadonlySet<string>,
): SessionSummary[] {
  return workspace.sessionIds
    .map(id => byId[id])
    .filter((summary): summary is SessionSummary => summary !== undefined
      && !summary.blank
      && summary.origin !== 'subagent'
      && !archived.has(summary.id))
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

type MenuState =
  | { kind: 'group-add'; groupId: string }
  | { kind: 'move'; path: string; fromGroupId: string | null }
  | null

// ---------------------------------------------------------------------------
// GroupPanel.
// ---------------------------------------------------------------------------

export function GroupPanel(props: GroupPanelProps) {
  const { wsg, t = (key) => key } = props
  const api = wsg.api

  const hasData = typeof props.useWorkspaces === 'function' && typeof props.useSessions === 'function'
  const fallback = useRef((_selector: unknown) => undefined).current
  const useWorkspacesHook = (props.useWorkspaces ?? fallback) as SnapshotHook
  const useSessionsHook = (props.useSessions ?? fallback) as SnapshotHook

  const items = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { items?: WorkspaceView[] } | null | undefined)?.items) ?? []) as WorkspaceView[]
  const archivedIds = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { archivedSessionIds?: readonly string[] } | null | undefined)?.archivedSessionIds) ?? []) as readonly string[]
  const byId = (useSessionsHook((snapshot: unknown) =>
    (snapshot as { byId?: Record<string, SessionSummary> } | null | undefined)?.byId) ?? {}) as Record<string, SessionSummary>

  const [groups, setGroups] = useState<WorkspaceGroup[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [storeNotice, setStoreNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [ungroupedOpen, setUngroupedOpen] = useState(false)
  const [menu, setMenu] = useState<MenuState>(null)
  const [drag, setDrag] = useState<GroupDrag | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await api.list()
    if (result.ok) {
      setGroups(result.value.groups)
      setStoreNotice(result.value.notice)
      setLoadError(null)
    } else {
      setLoadError(result.error.message)
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await refresh()
    } catch (error) {
      setActionError(String(error instanceof Error ? error.message : error))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const toggle = useCallback((key: string) => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // --- drag & drop -------------------------------------------------------

  const startDrag = (path: string, fromGroupId: string | null) => (event: ReactDragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('application/x-wsg-path', path)
    event.dataTransfer.setData('text/plain', path)
    event.dataTransfer.effectAllowed = 'move'
    setDrag({ path, fromGroupId })
    setMenu(null)
    setConfirmingDeleteId(null)
  }

  const endDrag = () => {
    setDrag(null)
    setDragOverKey(null)
  }

  /** Highlight only headers that would actually take this drop (move matrix). */
  const headerDragOver = (key: string, targetGroupId: string | null) => (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isDropTarget(drag, targetGroupId)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverKey(key)
  }

  const headerDragLeave = (key: string) => (event: ReactDragEvent<HTMLDivElement>) => {
    // Child elements fire dragleave on entry — ignore leaves that stay inside.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragOverKey(previous => (previous === key ? null : previous))
  }

  const headerDrop = (targetGroupId: string | null) => (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const move = computeGroupMove(drag, targetGroupId)
    setDrag(null)
    setDragOverKey(null)
    if (move === null) return
    const targetGroup = move.targetGroupId
    if (targetGroup !== null) setExpanded(previous => new Set(previous).add(`g:${targetGroup}`))
    const remove = move.remove
    const add = move.add
    void run(async () => {
      if (remove) await api.removeMember(remove.groupId, remove.path)
      if (add) await api.addMembers(add.groupId, [add.path])
    })
  }

  const byPath = useMemo(() => new Map(items.map(workspace => [workspace.path, workspace])), [items])
  const groupedPaths = useMemo(() => new Set((groups ?? []).flatMap(group => group.paths)), [groups])
  const ungrouped = useMemo(() => items.filter(workspace => !groupedPaths.has(workspace.path)), [items, groupedPaths])

  const archivedSet = useMemo(() => new Set(archivedIds), [archivedIds])

  /** Visible sessions of one workspace: real, non-archived, non-blank, non-subagent, newest first. */
  const sessionsOf = useCallback(
    (workspace: WorkspaceView) => visibleSessions(workspace, byId, archivedSet),
    [byId, archivedSet],
  )

  const startCreate = useCallback(() => {
    setCreating(true)
    setCreateDraft('')
    setConfirmingDeleteId(null)
    setMenu(null)
  }, [])

  const commitCreate = useCallback(() => {
    const title = createDraft.trim()
    if (title === '') {
      setCreating(false)
      return
    }
    void run(async () => {
      await api.create(title)
      setCreating(false)
      setCreateDraft('')
    })
  }, [api, createDraft, run])

  const createAndMove = useCallback((path: string) => {
    void run(async () => {
      const created = await api.create(basename(path))
      if (!created.ok) throw new Error(created.error.message)
      await api.addMembers(created.value.group.id, [path])
    })
    setMenu(null)
  }, [api, run])

  if (!hasData) {
    return (
      <div style={S.root}>
        <h2 style={S.title}>{t('title')}</h2>
        <p style={S.error}>{t('incompatible')}</p>
      </div>
    )
  }

  const menuGroups = menu === null ? [] : menu.kind === 'group-add'
    ? (groups ?? [])
    : (groups ?? []).filter(group => group.id !== (menu.kind === 'move' ? menu.fromGroupId : null))

  return (
    <div style={S.root} onClick={() => setConfirmingDeleteId(null)}>
      <div style={S.head}>
        <h2 style={S.title}>{t('title')}</h2>
        <div style={S.grow} />
        {creating
          ? (
              <input
                autoFocus
                style={{ ...S.input, width: 200 }}
                value={createDraft}
                placeholder={t('createGroup')}
                disabled={busy}
                onChange={event => setCreateDraft(event.target.value)}
                onClick={event => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitCreate()
                  if (event.key === 'Escape') { setCreating(false); setCreateDraft('') }
                }}
                onBlur={() => { if (createDraft.trim() === '') setCreating(false) }}
              />
            )
          : (
              <button type="button" style={S.btnPrimary} disabled={busy} onClick={(event) => { event.stopPropagation(); startCreate() }}>
                {t('createGroup')}
              </button>
            )}
      </div>

      {storeNotice !== null && <p style={S.notice}>{t('loadFailed')} — {storeNotice}</p>}
      {loadError !== null && (
        <p style={S.error}>
          {t('loadFailed')}：{loadError}{' '}
          <button type="button" style={S.btn} onClick={() => void refresh()}>{t('retry')}</button>
        </p>
      )}
      {actionError !== null && <p style={S.error}>{actionError}</p>}

      {groups !== null && groups.length === 0 && ungrouped.length === 0 && (
        <div style={S.empty}>
          <FolderGlyph />
          <span>{t('noGroups')}</span>
        </div>
      )}

      {(groups ?? []).map(group => {
        const open = expanded.has(`g:${group.id}`)
        const members = group.paths
        return (
          <div style={S.section} key={group.id}>
            <div
              style={{ ...S.groupRow, ...(dragOverKey === `g:${group.id}` ? S.dragOverHead : null) }}
              onClick={() => toggle(`g:${group.id}`)}
              onDragOver={headerDragOver(`g:${group.id}`, group.id)}
              onDragLeave={headerDragLeave(`g:${group.id}`)}
              onDrop={headerDrop(group.id)}
              onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
              onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
            >
              <Chevron open={open} />
              {renamingId === group.id
                ? (
                    <input
                      autoFocus
                      style={{ ...S.input, width: 180 }}
                      value={renameDraft}
                      disabled={busy}
                      onChange={event => setRenameDraft(event.target.value)}
                      onClick={event => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          const title = renameDraft.trim()
                          if (title !== '') void run(() => api.rename(group.id, title))
                          setRenamingId(null)
                        }
                        if (event.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => setRenamingId(null)}
                    />
                  )
                : <span style={S.groupTitle}>{group.title}</span>}
              <span style={S.count}>{t('membersCount', { count: members.length })}</span>
              <div style={S.rowBtns} onClick={event => event.stopPropagation()}>
                {confirmingDeleteId === group.id
                  ? (
                      <button
                        type="button"
                        style={S.confirmBtn}
                        disabled={busy}
                        onClick={event => {
                          event.stopPropagation()
                          void run(() => api.remove(group.id))
                          setConfirmingDeleteId(null)
                        }}
                      >
                        {t('confirmDelete')}
                      </button>
                    )
                  : (
                      <button
                        type="button"
                        style={{ ...S.iconBtn, ...S.danger }}
                        title={t('delete')}
                        disabled={busy}
                        onClick={event => { event.stopPropagation(); setConfirmingDeleteId(group.id); setMenu(null) }}
                      >
                        <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M2.5 3.5h7M5 3.5V2.2h2v1.3M3.5 3.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                <button type="button" style={S.iconBtn} title={t('rename')} disabled={busy}
                  onClick={event => { event.stopPropagation(); setRenamingId(group.id); setRenameDraft(group.title); setConfirmingDeleteId(null); setMenu(null) }}>
                  <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
                    <path d="m8.3 1.9 1.8 1.8-6 6-2.3.5.5-2.3 6-6Z" stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="button" style={S.iconBtn} title={t('addWorkspace')} disabled={busy}
                  onClick={event => { event.stopPropagation(); setMenu(menu?.kind === 'group-add' && menu.groupId === group.id ? null : { kind: 'group-add', groupId: group.id }); setConfirmingDeleteId(null) }}>
                  <PlusGlyph />
                </button>
              </div>

              {menu?.kind === 'group-add' && menu.groupId === group.id && (
                <>
                  <div style={S.backdrop} onClick={event => { event.stopPropagation(); setMenu(null) }} />
                  <div style={S.menu} onClick={event => event.stopPropagation()}>
                    <div style={S.menuLabel}>{t('addWorkspace')}</div>
                    {items.filter(workspace => !group.paths.includes(workspace.path)).length === 0 && (
                      <div style={S.menuLabel}>{t('nothingToAdd')}</div>
                    )}
                    {items.filter(workspace => !group.paths.includes(workspace.path)).map(workspace => (
                      <button
                        key={workspace.path}
                        type="button"
                        style={S.menuItem}
                        disabled={busy}
                        onClick={() => {
                          void run(() => api.addMembers(group.id, [workspace.path]))
                          setMenu(null)
                        }}
                      >
                        {workspace.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {open && (
              <div>
                {members.length === 0 && (
                  <div style={{ ...S.menuLabel, paddingLeft: 30 }}>{t('emptyGroup')}</div>
                )}
                {members.map(path => {
                  const workspace = byPath.get(path)
                  const rowOpen = expanded.has(`w:${path}`)
                  const sessions = workspace === undefined ? [] : sessionsOf(workspace)
                  return (
                    <div key={path}>
                      <div
                        style={{ ...S.wsRow, ...(drag?.path === path ? S.draggingRow : null) }}
                        draggable
                        onDragStart={startDrag(path, group.id)}
                        onDragEnd={endDrag}
                        onClick={() => workspace !== undefined && toggle(`w:${path}`)}
                        onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
                        onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                      >
                        {workspace === undefined ? <span style={{ width: 10 }} /> : <Chevron open={rowOpen} />}
                        <FolderGlyph />
                        <span style={{ ...S.wsTitle, opacity: workspace === undefined ? 0.45 : undefined }}>
                          {workspace?.title ?? basename(path)}
                        </span>
                        {workspace === undefined && <span style={S.badge}>{t('unregistered')}</span>}
                        <div style={S.rowBtns} onClick={event => event.stopPropagation()}>
                          {workspace !== undefined && (
                            <button type="button" style={S.iconBtn} title={t('newSession')} disabled={busy}
                              onClick={() => wsg.nav.startSession(workspace.workspaceId)}>
                              <PlusGlyph />
                            </button>
                          )}
                          <button type="button" style={S.iconBtn} title={t('moveToGroup')} disabled={busy}
                            onClick={event => { event.stopPropagation(); setMenu(menu?.kind === 'move' && menu.path === path ? null : { kind: 'move', path, fromGroupId: group.id }); setConfirmingDeleteId(null) }}>
                            <DotsGlyph />
                          </button>
                        </div>

                        {menu?.kind === 'move' && menu.path === path && (
                          <>
                            <div style={S.backdrop} onClick={event => { event.stopPropagation(); setMenu(null) }} />
                            <div style={S.menu} onClick={event => event.stopPropagation()}>
                              {menuGroups.map(target => (
                                <button
                                  key={target.id}
                                  type="button"
                                  style={S.menuItem}
                                  disabled={busy}
                                  onClick={() => {
                                    void run(async () => {
                                      if (menu.fromGroupId !== null) await api.removeMember(menu.fromGroupId, path)
                                      await api.addMembers(target.id, [path])
                                    })
                                    setMenu(null)
                                  }}
                                >
                                  {target.title}
                                </button>
                              ))}
                              <div style={S.separator} />
                              <button type="button" style={S.menuItem} disabled={busy} onClick={() => createAndMove(path)}>
                                {t('newGroupAndMove')}
                              </button>
                              <button
                                type="button"
                                style={{ ...S.menuItem, ...S.danger }}
                                disabled={busy}
                                onClick={() => {
                                  void run(() => api.removeMember(group.id, path))
                                  setMenu(null)
                                }}
                              >
                                {t('removeFromGroup')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {workspace !== undefined && rowOpen && (
                        <div style={S.sessionRows}>
                          {sessions.length === 0 && (
                            <div style={{ ...S.menuLabel, paddingLeft: 50 }}>{t('noSessions')}</div>
                          )}
                          {sessions.map(summary => (
                            <div
                              key={summary.id}
                              style={S.sessionRow}
                              onClick={() => wsg.nav.openSession(summary.id)}
                              onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
                              onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                            >
                              {summary.running && <span style={S.dot} />}
                              <span style={S.sessionTitle}>{summary.displayTitle}</span>
                              <span style={S.time}>{formatRelative(summary.updatedAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {(ungrouped.length > 0 || drag?.fromGroupId != null) && (
        <div style={S.section}>
          <div
            style={{ ...S.groupRow, ...(dragOverKey === 'ungrouped' ? S.dragOverHead : null) }}
            onClick={() => setUngroupedOpen(open => !open)}
            onDragOver={headerDragOver('ungrouped', null)}
            onDragLeave={headerDragLeave('ungrouped')}
            onDrop={headerDrop(null)}
            onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
            onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
          >
            <Chevron open={ungroupedOpen} />
            <span style={{ ...S.groupTitle, opacity: 0.8 }}>{t('ungrouped')}</span>
            <span style={S.count}>{t('membersCount', { count: ungrouped.length })}</span>
            {ungrouped.length === 0 && drag?.fromGroupId != null && (
              <span style={S.menuLabel}>{t('dropToUngrouped')}</span>
            )}
          </div>
          {ungroupedOpen && ungrouped.map(workspace => (
            <div key={workspace.path}>
              <div
                style={{ ...S.wsRow, ...(drag?.path === workspace.path ? S.draggingRow : null) }}
                draggable
                onDragStart={startDrag(workspace.path, null)}
                onDragEnd={endDrag}
                onClick={() => toggle(`w:u:${workspace.path}`)}
                onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
                onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
              >
                <Chevron open={expanded.has(`w:u:${workspace.path}`)} />
                <FolderGlyph />
                <span style={S.wsTitle}>{workspace.title}</span>
                <div style={S.rowBtns} onClick={event => event.stopPropagation()}>
                  <button type="button" style={S.iconBtn} title={t('newSession')} disabled={busy}
                    onClick={() => wsg.nav.startSession(workspace.workspaceId)}>
                    <PlusGlyph />
                  </button>
                  <button type="button" style={S.iconBtn} title={t('addToGroup')} disabled={busy}
                    onClick={event => { event.stopPropagation(); setMenu({ kind: 'move', path: workspace.path, fromGroupId: null }); setConfirmingDeleteId(null) }}>
                    <DotsGlyph />
                  </button>
                </div>

                {menu?.kind === 'move' && menu.path === workspace.path && menu.fromGroupId === null && (
                  <>
                    <div style={S.backdrop} onClick={event => { event.stopPropagation(); setMenu(null) }} />
                    <div style={S.menu} onClick={event => event.stopPropagation()}>
                      {menuGroups.length === 0 && <div style={S.menuLabel}>{t('nothingToAdd')}</div>}
                      {menuGroups.map(target => (
                        <button
                          key={target.id}
                          type="button"
                          style={S.menuItem}
                          disabled={busy}
                          onClick={() => {
                            void run(() => api.addMembers(target.id, [workspace.path]))
                            setMenu(null)
                          }}
                        >
                          {target.title}
                        </button>
                      ))}
                      <div style={S.separator} />
                      <button type="button" style={S.menuItem} disabled={busy} onClick={() => createAndMove(workspace.path)}>
                        {t('newGroupAndMove')}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {expanded.has(`w:u:${workspace.path}`) && (
                <div style={S.sessionRows}>
                  {sessionsOf(workspace).length === 0 && (
                    <div style={{ ...S.menuLabel, paddingLeft: 50 }}>{t('noSessions')}</div>
                  )}
                  {sessionsOf(workspace).map(summary => (
                    <div
                      key={summary.id}
                      style={S.sessionRow}
                      onClick={() => wsg.nav.openSession(summary.id)}
                      onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
                      onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                    >
                      {summary.running && <span style={S.dot} />}
                      <span style={S.sessionTitle}>{summary.displayTitle}</span>
                      <span style={S.time}>{formatRelative(summary.updatedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
