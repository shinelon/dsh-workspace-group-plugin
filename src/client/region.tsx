/**
 * 「分组」sidebar region: registers at priority -1 under `sidebar.workspaces`,
 * shadowing the official WorkspaceBrowser with a custom-group view over the
 * same official data services. The official browser entry stays live —
 * disposing this registration (mode switch or plugin disable) restores the
 * official view untouched.
 *
 * Row actions are self-built — the renderer's boundRenderSlot rejects keys
 * not declared by our own entry (SlotOwnershipError), so official action
 * entries cannot be re-rendered here (verified in dsh-client-ui-renderer
 * lib/client.js). Behavior mirrors the official browser instead: workspace
 * rows (open new session, rename, delete, group membership), session rows
 * (open, pin, rename via double-click or menu, fork, archive with the
 * stop-and-archive offer for running sessions), actions revealed on hover
 * via an injected stylesheet, like the official rows.
 * @module dsh-workspace-group-manager/client/region
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspaceGroup } from './api'
import type { WsgFace } from './face'
import {
  basename,
  Chevron,
  FolderGlyph,
  formatRelative,
  PanelIcon,
  S,
  visibleSessions,
} from './panel'
import type { SessionSummary, WorkspaceView } from './panel'

/** localStorage key deciding which sidebar region renders (after reload). */
export const MODE_KEY = 'wsg.sidebarMode'

type Translator = (key: string, vars?: Record<string, string | number>) => string

type SnapshotHook = <Selected>(selector: (snapshot: unknown) => Selected) => Selected

export interface GroupedRegionProps {
  /** Inject face (api + nav + ws mutations), bound by the plugin body. */
  wsg: WsgFace
  /** Locale seat for the register option's namespace. */
  t?: Translator
  /** Global seat hooks (framework supplies these to every slot component). */
  useWorkspaces?: SnapshotHook
  useSessions?: SnapshotHook
  /** Shell owner share: wide renders the full region, rail the icon column. */
  wide?: boolean
  expandSidebar?: () => void
}

const ROW_HOVER = { background: 'rgba(127,140,158,0.14)' } as const

/** Hover-revealed action strips, official-style: hidden until row hover/focus. */
const HOVER_CSS = [
  '.wsg-row .wsg-actions { visibility: hidden; }',
  '.wsg-row:hover .wsg-actions,',
  '.wsg-row:focus-within .wsg-actions,',
  '.wsg-row .wsg-actions[data-open="true"] { visibility: visible; }',
].join('\n')

/** Region-local styles tuned to the official browser's proportions. */
const R = {
  head: { display: 'flex', alignItems: 'center', gap: 4, padding: '10px 8px 6px 14px' } as const,
  title: { fontSize: 15, fontWeight: 600, margin: 0, whiteSpace: 'nowrap' } as const,
  badge: {
    fontSize: 10,
    lineHeight: '15px',
    padding: '0 6px',
    borderRadius: 8,
    background: 'rgba(127,140,158,0.2)',
    opacity: 0.85,
    whiteSpace: 'nowrap',
  } as const,
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    font: 'inherit',
    color: 'inherit',
    opacity: 0.62,
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
  } as const,
  groupRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as const,
  groupTitle: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  count: { fontSize: 11, opacity: 0.5, flexShrink: 0 } as const,
  wsRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '4px 8px 4px 26px',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as const,
  wsTitle: { fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  sessionRows: { margin: '1px 0 4px' } as const,
  sessionRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '3px 8px 3px 50px',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  } as const,
  sessionTitle: { fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  time: { fontSize: 11, opacity: 0.45, marginLeft: 'auto', flexShrink: 0 } as const,
  dot: { width: 7, height: 7, borderRadius: 4, background: '#59b077', flexShrink: 0 } as const,
  dotSlot: { width: 7, flexShrink: 0 } as const,
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    marginLeft: 'auto',
    flexShrink: 0,
  } as const,
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '0 12px 10px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(196,150,74,0.16)',
  } as const,
  bannerText: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  menuLabel: { fontSize: 11, opacity: 0.5, padding: '4px 8px 2px' } as const,
} as const

/** Official-style「新建工作目录」glyph: folder outline with a plus. */
function FolderPlusGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 4.2c0-.94.76-1.7 1.7-1.7h2.9c.45 0 .88.18 1.2.5l1 1c.32.32.75.5 1.2.5h4.3c.94 0 1.7.76 1.7 1.7v6.6c0 .94-.76 1.7-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7V4.2Z" fill="currentColor" opacity={0.4} />
      <path d="M8 7.4v3.6M6.2 9.2h3.6" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  )
}

/** 「使用官方视图」glyph: plain list lines (the official flat list). */
function ListViewGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  )
}

function DotsGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
      <circle cx={2.5} cy={6} r={1.1} fill="currentColor" />
      <circle cx={6} cy={6} r={1.1} fill="currentColor" />
      <circle cx={9.5} cy={6} r={1.1} fill="currentColor" />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  )
}

function PinGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M7.5 1.5 10.5 4.5 8 5.5 5.5 8 4.8 10 2 7.2 4 6.5 6.5 4z" fill="currentColor" />
      <path d="m3.5 8.5-1.8 1.8" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
    </svg>
  )
}

function ArchiveGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
      <rect x={1.5} y={2} width={9} height={2.6} rx={0.6} stroke="currentColor" strokeWidth={1.1} fill="none" />
      <path d="M2.6 4.6v4.4c0 .55.45 1 1 1h4.8c.55 0 1-.45 1-1V4.6M4.7 6.4h2.6" stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinecap="round" />
    </svg>
  )
}

function RenameGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
      <path d="m8.3 1.9 1.8 1.8-6 6-2.3.5.5-2.3 6-6Z" stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinejoin="round" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 3.5h7M5 3.5V2.2h2v1.3M3.5 3.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Rail-mode stand-in: one icon button that expands the sidebar. */
function RailStub({ expandSidebar }: { expandSidebar?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
      <button
        type="button"
        title="工作区分组"
        onClick={() => expandSidebar?.()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          font: 'inherit',
          color: 'inherit',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        <PanelIcon size={16} />
      </button>
    </div>
  )
}

/**
 * The grouped sidebar region. Rendered while `wsg.sidebarMode` is not
 * 'official'; the list-icon button flips the flag and reloads.
 */
export function GroupedRegion(props: GroupedRegionProps) {
  const { wsg } = props
  const hasData = typeof props.useWorkspaces === 'function' && typeof props.useSessions === 'function'
  const fallback = useCallback((_selector: unknown) => undefined, [])
  const useWorkspacesHook = (props.useWorkspaces ?? fallback) as SnapshotHook
  const useSessionsHook = (props.useSessions ?? fallback) as SnapshotHook

  const items = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { items?: WorkspaceView[] } | null | undefined)?.items) ?? []) as WorkspaceView[]
  const archivedIds = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { archivedSessionIds?: readonly string[] } | null | undefined)?.archivedSessionIds) ?? []) as readonly string[]
  const pinnedIds = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { pinnedSessionIds?: readonly string[] } | null | undefined)?.pinnedSessionIds) ?? []) as readonly string[]
  const byId = (useSessionsHook((snapshot: unknown) =>
    (snapshot as { byId?: Record<string, SessionSummary> } | null | undefined)?.byId) ?? {}) as Record<string, SessionSummary>

  if (props.wide === false) return <RailStub expandSidebar={props.expandSidebar} />

  return (
    <RegionBody
      {...props}
      hasData={hasData}
      items={items}
      archivedIds={archivedIds}
      pinnedIds={pinnedIds}
      byId={byId}
    />
  )
}

/** Inner body: hooks are unconditional above; this component just renders. */
function RegionBody(
  props: GroupedRegionProps & {
    hasData: boolean
    items: WorkspaceView[]
    archivedIds: readonly string[]
    pinnedIds: readonly string[]
    byId: Record<string, SessionSummary>
  },
) {
  const { wsg, t = key => key, items, archivedIds, pinnedIds, byId } = props
  const [groups, setGroups] = useState<WorkspaceGroup[] | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [wsMenuPath, setWsMenuPath] = useState<string | null>(null)
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [sessionRenameDraft, setSessionRenameDraft] = useState('')
  const [stopAsk, setStopAsk] = useState<{ sessionId: string; title: string } | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    void wsg.api.list().then(result => {
      if (!cancelled && result.ok) setGroups(result.value.groups)
      if (!cancelled && !result.ok) setActionError(result.error.message)
    })
    return () => { cancelled = true }
  }, [wsg.api])

  const byPath = useMemo(() => new Map(items.map(workspace => [workspace.path, workspace])), [items])
  const groupedPaths = useMemo(() => new Set((groups ?? []).flatMap(group => group.paths)), [groups])
  const ungrouped = useMemo(() => items.filter(workspace => !groupedPaths.has(workspace.path)), [items, groupedPaths])
  const archivedSet = useMemo(() => new Set(archivedIds), [archivedIds])
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (error) {
      setActionError(String(error instanceof Error ? error.message : error))
    } finally {
      setBusy(false)
    }
  }, [])

  const toggle = useCallback((key: string) => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const addWorkspace = useCallback(() => {
    void run(async () => {
      setAdding(true)
      try {
        const path = await wsg.ws.pickDirectory()
        if (path !== null) await wsg.ws.create(path)
      } finally {
        setAdding(false)
      }
    })
  }, [run, wsg.ws])

  const commitWorkspaceRename = (workspace: WorkspaceView | undefined) => {
    const title = renameDraft.trim()
    setRenamingPath(null)
    setRenameDraft('')
    if (workspace === undefined || title === '') return
    void run(() => wsg.ws.rename(workspace.workspaceId, title))
  }

  const deleteWorkspace = (workspace: WorkspaceView | undefined) => {
    setConfirmingPath(null)
    if (workspace === undefined) return
    void run(() => wsg.ws.remove(workspace.workspaceId))
  }

  const commitSessionRename = (summary: SessionSummary | undefined) => {
    const title = sessionRenameDraft.trim()
    setRenamingSessionId(null)
    setSessionRenameDraft('')
    if (summary === undefined || title === '' || title === summary.displayTitle) return
    void run(() => wsg.nav.renameSession(summary.id, title))
  }

  /** Plain archive; a running session raises the stop-and-archive offer. */
  const archiveSession = (summary: SessionSummary) => {
    void run(async () => {
      try {
        await wsg.nav.archiveSession(summary.id)
      } catch (error) {
        if ((error as { rpcError?: { code?: string } })?.rpcError?.code === 'workspace/session-active') {
          setStopAsk({ sessionId: summary.id, title: summary.displayTitle })
          return
        }
        throw error
      }
    })
  }

  const moveToGroup = (path: string, fromGroupId: string | null, groupId: string) => {
    void run(async () => {
      if (fromGroupId !== null) await wsg.api.removeMember(fromGroupId, path)
      await wsg.api.addMembers(groupId, [path])
      const refreshed = await wsg.api.list()
      if (refreshed.ok) setGroups(refreshed.value.groups)
    })
    setWsMenuPath(null)
  }

  const removeFromGroup = (path: string, fromGroupId: string) => {
    void run(async () => {
      await wsg.api.removeMember(fromGroupId, path)
      const refreshed = await wsg.api.list()
      if (refreshed.ok) setGroups(refreshed.value.groups)
    })
    setWsMenuPath(null)
  }

  if (!props.hasData) {
    return (
      <div style={S.root}>
        <div style={R.head}><h2 style={R.title}>{t('workspaceTitle')}</h2></div>
        <p style={{ ...S.error, margin: '0 12px' }}>{t('incompatible')}</p>
      </div>
    )
  }

  const renderSessionRow = (summary: SessionSummary) => {
    const pinned = pinnedSet.has(summary.id)
    const menuOpen = sessionMenuId === summary.id
    const renaming = renamingSessionId === summary.id
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div
        key={summary.id}
        className="wsg-row"
        style={R.sessionRow}
        onClick={() => wsg.nav.openSession(summary.id)}
        onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
        onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
      >
        {summary.running ? <span style={R.dot} /> : pinned ? <PinGlyph /> : <span style={R.dotSlot} />}
        {renaming
          ? (
              <input
                autoFocus
                style={{ ...S.input, width: 160 }}
                value={sessionRenameDraft}
                disabled={busy}
                onChange={event => setSessionRenameDraft(event.target.value)}
                onClick={stop}
                onKeyDown={event => {
                  if (event.key === 'Enter') commitSessionRename(summary)
                  if (event.key === 'Escape') { setRenamingSessionId(null); setSessionRenameDraft('') }
                }}
                onBlur={() => commitSessionRename(summary)}
              />
            )
          : (
              <span
                style={R.sessionTitle}
                title={summary.displayTitle}
                onDoubleClick={event => { event.stopPropagation(); setRenamingSessionId(summary.id); setSessionRenameDraft(summary.displayTitle); setSessionMenuId(null) }}
              >
                {summary.displayTitle}
              </span>
            )}
        <span style={R.time}>{formatRelative(summary.updatedAt)}</span>
        <div className="wsg-actions" data-open={menuOpen} style={R.actions} onClick={stop}>
          <button
            type="button"
            style={{ ...S.iconBtn, ...(pinned ? { opacity: 0.95, color: '#d9b96a' } : null) }}
            title={pinned ? t('unpin') : t('pin')}
            disabled={busy}
            onClick={event => { event.stopPropagation(); void run(() => pinned ? wsg.nav.unpinSession(summary.id) : wsg.nav.pinSession(summary.id)) }}
          >
            <PinGlyph />
          </button>
          <button
            type="button"
            style={S.iconBtn}
            title={t('archive')}
            disabled={busy}
            onClick={event => { event.stopPropagation(); archiveSession(summary) }}
          >
            <ArchiveGlyph />
          </button>
          <button
            type="button"
            style={S.iconBtn}
            title={t('more')}
            disabled={busy}
            onClick={event => { event.stopPropagation(); setSessionMenuId(menuOpen ? null : summary.id); setWsMenuPath(null) }}
          >
            <DotsGlyph />
          </button>
        </div>

        {menuOpen && (
          <>
            <div style={S.backdrop} onClick={event => { event.stopPropagation(); setSessionMenuId(null) }} />
            <div style={S.menu} onClick={event => event.stopPropagation()}>
              <button type="button" style={S.menuItem} disabled={busy}
                onClick={() => { void run(() => pinned ? wsg.nav.unpinSession(summary.id) : wsg.nav.pinSession(summary.id)); setSessionMenuId(null) }}>
                {pinned ? t('unpin') : t('pin')}
              </button>
              <button type="button" style={S.menuItem} disabled={busy}
                onClick={event => { event.stopPropagation(); setRenamingSessionId(summary.id); setSessionRenameDraft(summary.displayTitle); setSessionMenuId(null) }}>
                {t('rename')}
              </button>
              <button type="button" style={S.menuItem} disabled={busy}
                onClick={() => { void run(() => wsg.nav.forkSession(summary.id)); setSessionMenuId(null) }}>
                {t('fork')}
              </button>
              <div style={S.separator} />
              {archivedSet.has(summary.id)
                ? (
                    <button type="button" style={S.menuItem} disabled={busy}
                      onClick={() => { void run(() => wsg.nav.unarchiveSession(summary.id)); setSessionMenuId(null) }}>
                      {t('unarchive')}
                    </button>
                  )
                : (
                    <button type="button" style={{ ...S.menuItem, ...S.danger }} disabled={busy}
                      onClick={() => { archiveSession(summary); setSessionMenuId(null) }}>
                      {t('archive')}
                    </button>
                  )}
            </div>
          </>
        )}
      </div>
    )
  }

  const renderWorkspaceRow = (path: string, fromGroupId: string | null) => {
    const workspace = byPath.get(path)
    const expandKey = fromGroupId === null ? `w:u:${path}` : `w:${path}`
    const rowOpen = expanded.has(expandKey)
    const sessions = workspace === undefined
      ? []
      : [
          ...visibleSessions(workspace, byId, archivedSet).filter(summary => pinnedSet.has(summary.id)),
          ...visibleSessions(workspace, byId, archivedSet).filter(summary => !pinnedSet.has(summary.id)),
        ]
    const menuOpen = wsMenuPath === path
    const stripOpen = menuOpen || confirmingPath === path || renamingPath === path
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div key={`${fromGroupId ?? 'ungrouped'}:${path}`}>
        <div
          className="wsg-row"
          style={R.wsRow}
          onClick={() => toggle(expandKey)}
          onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
          onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
        >
          {workspace === undefined ? <span style={{ width: 10 }} /> : <Chevron open={rowOpen} />}
          <FolderGlyph />
          {renamingPath === path
            ? (
                <input
                  autoFocus
                  style={{ ...S.input, width: 180 }}
                  value={renameDraft}
                  disabled={busy}
                  onChange={event => setRenameDraft(event.target.value)}
                  onClick={stop}
                  onKeyDown={event => {
                    if (event.key === 'Enter') commitWorkspaceRename(workspace)
                    if (event.key === 'Escape') { setRenamingPath(null); setRenameDraft('') }
                  }}
                  onBlur={() => commitWorkspaceRename(workspace)}
                />
              )
            : (
                <span style={{ ...R.wsTitle, opacity: workspace === undefined ? 0.45 : undefined }} title={workspace?.title ?? path}>
                  {workspace?.title ?? basename(path)}
                </span>
              )}
          {workspace === undefined && <span style={S.badge}>{t('unregistered')}</span>}
          <div className="wsg-actions" data-open={stripOpen} style={R.actions} onClick={stop}>
            {confirmingPath === path
              ? (
                  <button type="button" style={S.confirmBtn} disabled={busy}
                    onClick={event => { event.stopPropagation(); deleteWorkspace(workspace) }}>
                    {t('confirmDelete')}
                  </button>
                )
              : null}
            {workspace !== undefined && (
              <button type="button" style={S.iconBtn} title={t('newSession')} disabled={busy}
                onClick={event => { event.stopPropagation(); wsg.nav.startSession(workspace.workspaceId) }}>
                <PlusGlyph />
              </button>
            )}
            <button
              type="button"
              style={S.iconBtn}
              title={t('more')}
              disabled={busy}
              onClick={event => { event.stopPropagation(); setWsMenuPath(menuOpen ? null : path); setSessionMenuId(null); setConfirmingPath(null) }}
            >
              <DotsGlyph />
            </button>
          </div>

          {menuOpen && (
            <>
              <div style={S.backdrop} onClick={event => { event.stopPropagation(); setWsMenuPath(null) }} />
              <div style={S.menu} onClick={event => event.stopPropagation()}>
                <button type="button" style={S.menuItem} disabled={busy}
                  onClick={event => { event.stopPropagation(); setRenamingPath(path); setRenameDraft(workspace?.title ?? basename(path)); setWsMenuPath(null) }}>
                  {t('rename')}
                </button>
                {(groups ?? []).filter(group => group.id !== fromGroupId).map(group => (
                  <button key={group.id} type="button" style={S.menuItem} disabled={busy}
                    onClick={() => moveToGroup(path, fromGroupId, group.id)}>
                    {t('moveToGroup')} {group.title}
                  </button>
                ))}
                {fromGroupId !== null && (
                  <>
                    <div style={S.separator} />
                    <button type="button" style={{ ...S.menuItem, ...S.danger }} disabled={busy}
                      onClick={() => removeFromGroup(path, fromGroupId)}>
                      {t('removeFromGroup')}
                    </button>
                  </>
                )}
                <div style={S.separator} />
                <button type="button" style={{ ...S.menuItem, ...S.danger }} disabled={busy}
                  onClick={event => { event.stopPropagation(); setConfirmingPath(path); setWsMenuPath(null) }}>
                  {t('delete')}
                </button>
              </div>
            </>
          )}
        </div>

        {rowOpen && workspace !== undefined && (
          <div style={R.sessionRows}>
            {sessions.length === 0 && <div style={{ ...R.menuLabel, paddingLeft: 50 }}>{t('noSessions')}</div>}
            {sessions.map(renderSessionRow)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={S.root} onClick={() => setConfirmingPath(null)}>
      <style>{HOVER_CSS}</style>
      <div style={R.head}>
        <h2 style={R.title}>{t('workspaceTitle')}</h2>
        <span style={R.badge}>{t('panel')}</span>
        <div style={S.grow} />
        <button type="button" style={R.iconBtn} title={t('addWorkspace')} disabled={busy || adding} onClick={addWorkspace}>
          <FolderPlusGlyph />
        </button>
        <button
          type="button"
          style={R.iconBtn}
          title={t('useOfficialView')}
          onClick={() => {
            localStorage.setItem(MODE_KEY, 'official')
            location.reload()
          }}
        >
          <ListViewGlyph />
        </button>
      </div>

      {actionError !== null && <p style={{ ...S.error, margin: '0 12px 10px' }}>{actionError}</p>}

      {stopAsk !== null && (
        <div style={R.banner}>
          <span style={R.bannerText}>{t('stopAndArchiveAsk')} — {stopAsk.title}</span>
          <div style={S.grow} />
          <button type="button" style={S.confirmBtn} disabled={busy}
            onClick={() => { const ask = stopAsk; setStopAsk(null); void run(() => wsg.nav.archiveSessionStop(ask.sessionId)) }}>
            {t('stopAndArchive')}
          </button>
          <button type="button" style={S.btn} disabled={busy} onClick={() => setStopAsk(null)}>
            {t('cancel')}
          </button>
        </div>
      )}

      {groups === null && <div style={{ ...R.menuLabel, padding: '0 14px' }}>…</div>}

      {groups !== null && groups.length === 0 && ungrouped.length === 0 && (
        <div style={S.empty}>
          <FolderGlyph />
          <span>{t('noGroups')}</span>
        </div>
      )}

      {(groups ?? []).map(group => {
        const open = expanded.has(`g:${group.id}`)
        return (
          <div style={S.section} key={group.id}>
            <div
              style={R.groupRow}
              onClick={() => toggle(`g:${group.id}`)}
              onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
              onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
            >
              <Chevron open={open} />
              <span style={R.groupTitle}>{group.title}</span>
              <span style={R.count}>{t('membersCount', { count: group.paths.length })}</span>
            </div>
            {open && group.paths.map(path => renderWorkspaceRow(path, group.id))}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div style={S.section}>
          <div
            style={R.groupRow}
            onClick={() => toggle('ungrouped')}
            onMouseEnter={event => { Object.assign(event.currentTarget.style, ROW_HOVER) }}
            onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
          >
            <Chevron open={expanded.has('ungrouped')} />
            <span style={{ ...R.groupTitle, opacity: 0.8 }}>{t('ungrouped')}</span>
            <span style={R.count}>{t('membersCount', { count: ungrouped.length })}</span>
          </div>
          {expanded.has('ungrouped') && ungrouped.map(workspace => renderWorkspaceRow(workspace.path, null))}
        </div>
      )}
    </div>
  )
}

/**
 * Sidebar-foot sentinel rendered while the OFFICIAL view is active: the only
 * way back into the grouped view (flag + reload), since the grouped region is
 * not registered in that mode.
 */
export function OfficialModeSentinel({ t }: { t?: Translator }) {
  return (
    <button
      type="button"
      title={t?.('useGroupedView') ?? 'Workspace groups view'}
      aria-label={t?.('useGroupedView') ?? 'Workspace groups view'}
      onClick={() => {
        localStorage.setItem(MODE_KEY, 'grouped')
        location.reload()
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        font: 'inherit',
        color: 'inherit',
        opacity: 0.6,
        background: 'transparent',
        border: 'none',
        borderRadius: 5,
        cursor: 'pointer',
      }}
    >
      <PanelIcon size={15} />
    </button>
  )
}
