/**
 * 「分组」sidebar region: registers at priority -1 under `sidebar.workspaces`,
 * shadowing the official WorkspaceBrowser with a custom-group view over the
 * same official data services. The official browser entry stays live —
 * disposing this registration (mode switch or plugin disable) restores the
 * official view untouched.
 *
 * Visual fidelity: the official browser injects its stylesheets at apply time
 * (they persist while the entry is registered, even shadowed), so this region
 * renders with the OFFICIAL class names (Rows/Browser CSS-module hashes of
 * dsh-client-ui-workspace 0.1.7-rc.2) and the OFFICIAL primitives components
 * (icons, Menu, Tooltip) resolved through the module loader's require. The
 * official view-options menu is replicated: grouping modes (our custom groups
 * + by workspace / by workspace tree / single list), ordering (recent /
 * manual), and the three-state archived filter, persisted per browser.
 * Class hashes and composition are version-pinned to dsh.engines
 * >=0.1.7-rc.2; re-verify on DSH upgrades.
 * @module dsh-workspace-group-manager/client/region
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { WorkspaceGroup } from './api'
import type { WsgFace } from './face'
import { basename, formatRelative, PanelIcon, S } from './panel'
import type { SessionSummary, WorkspaceView } from './panel'
import { primitives, clsx } from './primitives'

/** localStorage keys (browser-local, official view state semantics). */
export const MODE_KEY = 'wsg.sidebarMode'
const VIEW_KEY = 'wsg.view.v1'

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

/** Grouping modes: our custom groups + the official registry modes. */
type GroupBy = 'groups' | 'workspace' | 'workspace-tree' | 'flat'
type OrderBy = 'updated' | 'manual'
type ArchivedFilter = 'hide' | 'show' | 'only'
interface ViewOpts { groupBy: GroupBy; orderBy: OrderBy; archivedFilter: ArchivedFilter }

const DEFAULT_VIEW: ViewOpts = { groupBy: 'groups', orderBy: 'updated', archivedFilter: 'hide' }

function loadView(): ViewOpts {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw !== null) return { ...DEFAULT_VIEW, ...(JSON.parse(raw) as Partial<ViewOpts>) }
  } catch { /* fall through to defaults */ }
  return { ...DEFAULT_VIEW }
}

function saveView(view: ViewOpts): void {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)) } catch { /* browser-local only */ }
}

/**
 * Official CSS-module class hashes (dsh-client-ui-workspace 0.1.7-rc.2).
 * The browser's own <style> tags are injected while its entry is registered,
 * so these resolve against the exact official rules (row metrics, hover
 * swaps, action reveal) with zero custom CSS.
 */
const ROWS = {
  projectRow: 'YDXeBa_projectRow',
  sessionRow: 'YDXeBa_sessionRow',
  slot: 'YDXeBa_slot',
  folder: 'YDXeBa_folder',
  folderActive: 'YDXeBa_folderActive',
  chevron: 'YDXeBa_chevron',
  arrow: 'YDXeBa_arrow',
  arrowOpen: 'YDXeBa_arrowOpen',
  projectText: 'YDXeBa_projectText',
  title: 'YDXeBa_title',
  time: 'YDXeBa_time',
  rowActions: 'YDXeBa_rowActions',
  iconButton: 'YDXeBa_iconButton',
  menuOpen: 'YDXeBa_menuOpen',
  dot: 'YDXeBa_dot',
  pinIndicator: 'YDXeBa_pinIndicator',
  archived: 'YDXeBa_archived',
  renameInput: 'YDXeBa_renameInput',
} as const

/** Official browser-shell classes (bhn1Oq_* from the same stylesheet). */
const SHELL = {
  root: 'bhn1Oq_root',
  list: 'bhn1Oq_list',
  groupSection: 'bhn1Oq_groupSection',
  sectionHeader: 'bhn1Oq_sectionHeader',
  sectionLabel: 'bhn1Oq_sectionLabel',
  headerActions: 'bhn1Oq_headerActions',
  iconButton: 'bhn1Oq_iconButton',
  emptyState: 'bhn1Oq_emptyState',
  emptyAction: 'bhn1Oq_emptyAction',
  viewOptionsMenu: 'bhn1Oq_viewOptionsMenu',
} as const

const R = {
  badge: {
    fontSize: 10,
    lineHeight: '15px',
    padding: '0 6px',
    borderRadius: 8,
    background: 'rgba(127,140,158,0.2)',
    opacity: 0.85,
    whiteSpace: 'nowrap',
  } as const,
  count: { fontSize: 11, opacity: 0.5, flexShrink: 0 } as const,
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
  cancelBtn: {
    font: 'inherit',
    fontSize: 11,
    color: 'inherit',
    background: 'rgba(127,140,158,0.14)',
    border: 'none',
    borderRadius: 5,
    padding: '2px 8px',
    cursor: 'pointer',
    flexShrink: 0,
  } as const,
  input: {
    font: 'inherit',
    fontSize: 13,
    color: 'inherit',
    background: 'rgba(127,140,158,0.12)',
    border: '1px solid rgba(127,140,158,0.4)',
    borderRadius: 6,
    padding: '2px 6px',
    outline: 'none',
    minWidth: 0,
  } as const,
  loading: { fontSize: 12, opacity: 0.5, padding: '0 14px' } as const,
} as const

function indent(px: number): CSSProperties {
  return { '--dsh-workspace-indent': `${px}px` } as CSSProperties
}

/** Official primitive by component name (icons accept a `size` prop). */
function Ico(props: { name: string; size?: number; className?: string }): ReactNode {
  const C = primitives()[props.name] as
    | ((p: { size?: number; className?: string }) => ReactNode)
    | undefined
  if (!C) return null
  return <C size={props.size} className={props.className} />
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

/** Normalize a workspace path for ancestry comparison (Windows-leaning). */
function normPath(path: string): string {
  return path.replace(/\/+/g, '\\').toLowerCase()
}

/**
 * The grouped sidebar region. Rendered while `wsg.sidebarMode` is not
 * 'official'; the list-icon button flips the flag and reloads.
 */
export function GroupedRegion(props: GroupedRegionProps) {
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
  const P = primitives()
  const Menu = P.Menu as
    | ((p: {
        open: boolean
        onClose: () => void
        portal?: boolean
        closeOnPointerLeave?: boolean
        dense?: boolean
        align?: string
        listClassName?: string
        selectedIds?: readonly string[]
        anchor: ReactNode
        items?: Array<
          | { type: 'label'; id: string; text: string }
          | { type: 'separator'; id: string }
          | { id: string; label: string; icon?: ReactNode; danger?: boolean }
        >
        onSelect?: (id: string) => void
        children?: ReactNode
      }) => ReactNode)
    | undefined

  const [groups, setGroups] = useState<WorkspaceGroup[] | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [wsMenuPath, setWsMenuPath] = useState<string | null>(null)
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null)
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null)
  const [confirmingGroupId, setConfirmingGroupId] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [groupRenameDraft, setGroupRenameDraft] = useState('')
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [sessionRenameDraft, setSessionRenameDraft] = useState('')
  const [stopAsk, setStopAsk] = useState<{ sessionId: string; title: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [view, setViewState] = useState<ViewOpts>(loadView)

  const setView = useCallback((patch: Partial<ViewOpts>) => {
    setViewState(previous => {
      const next = { ...previous, ...patch }
      saveView(next)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void wsg.api.list().then(result => {
      if (!cancelled && result.ok) setGroups(result.value.groups)
      if (!cancelled && !result.ok) setActionError(result.error.message)
    })
    return () => { cancelled = true }
  }, [wsg.api])

  const refreshGroups = useCallback(async () => {
    const result = await wsg.api.list()
    if (result.ok) setGroups(result.value.groups)
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

  /** One workspace's sessions under the current ordering + archived filter. */
  const sessionsOf = useCallback((workspace: WorkspaceView): SessionSummary[] => {
    const all = workspace.sessionIds
      .map(id => byId[id])
      .filter((summary): summary is SessionSummary => summary !== undefined && !summary.blank && summary.origin !== 'subagent')
    const normal = all.filter(summary => !archivedSet.has(summary.id))
    const archived = all.filter(summary => archivedSet.has(summary.id)).sort((a, b) => b.updatedAt - a.updatedAt)
    let list: SessionSummary[]
    if (view.archivedFilter === 'only') list = archived
    else if (view.archivedFilter === 'show') list = [...normal, ...archived]
    else list = normal
    const pinned = list.filter(summary => pinnedSet.has(summary.id))
    const rest = list.filter(summary => !pinnedSet.has(summary.id))
    if (view.orderBy === 'updated') rest.sort((a, b) => b.updatedAt - a.updatedAt)
    else rest.sort((a, b) => workspace.sessionIds.indexOf(a.id) - workspace.sessionIds.indexOf(b.id))
    return [...pinned, ...rest]
  }, [byId, archivedSet, pinnedSet, view.archivedFilter, view.orderBy])

  /** Flat single-list sessions across all workspaces. */
  const flatSessions = useMemo((): SessionSummary[] => {
    const registryOrder = new Map<string, number>()
    items.forEach(workspace => workspace.sessionIds.forEach(id => { if (!registryOrder.has(id)) registryOrder.set(id, registryOrder.size) }))
    const all = [...registryOrder.keys()]
      .map(id => byId[id])
      .filter((summary): summary is SessionSummary => summary !== undefined && !summary.blank && summary.origin !== 'subagent')
    const normal = all.filter(summary => !archivedSet.has(summary.id))
    const archived = all.filter(summary => archivedSet.has(summary.id)).sort((a, b) => b.updatedAt - a.updatedAt)
    let list: SessionSummary[]
    if (view.archivedFilter === 'only') list = archived
    else if (view.archivedFilter === 'show') list = [...normal, ...archived]
    else list = normal
    const pinned = list.filter(summary => pinnedSet.has(summary.id))
    const rest = list.filter(summary => !pinnedSet.has(summary.id))
    if (view.orderBy === 'updated') rest.sort((a, b) => b.updatedAt - a.updatedAt)
    else rest.sort((a, b) => (registryOrder.get(a.id) ?? 0) - (registryOrder.get(b.id) ?? 0))
    return [...pinned, ...rest]
  }, [items, byId, archivedSet, pinnedSet, view.archivedFilter, view.orderBy])

  /** Workspaces in display order (manual = registry order; recent = last mutation). */
  const orderedWorkspaces = useMemo((): WorkspaceView[] => {
    if (view.orderBy === 'updated') return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return items
  }, [items, view.orderBy])

  /** Registered-ancestry nesting for the workspace-tree mode. */
  const tree = useMemo((): { roots: WorkspaceView[]; childrenOf: (id: string) => WorkspaceView[] } | null => {
    if (view.groupBy !== 'workspace-tree') return null
    const children = new Map<string, WorkspaceView[]>()
    const roots: WorkspaceView[] = []
    const norms = orderedWorkspaces.map(workspace => ({ workspace, norm: normPath(workspace.path) }))
    for (const entry of norms) {
      let parent: WorkspaceView | undefined
      let best = -1
      for (const candidate of norms) {
        if (candidate === entry) continue
        const candidatePath = candidate.norm.endsWith('\\') ? candidate.norm : `${candidate.norm}\\`
        if (entry.norm.startsWith(candidatePath) && candidate.norm.length > best) {
          best = candidate.norm.length
          parent = candidate.workspace
        }
      }
      if (parent === undefined) roots.push(entry.workspace)
      else {
        const list = children.get(parent.workspaceId) ?? []
        list.push(entry.workspace)
        children.set(parent.workspaceId, list)
      }
    }
    return { roots, childrenOf: id => children.get(id) ?? [] }
  }, [view.groupBy, orderedWorkspaces])

  const archivedOnlyEmpty = view.archivedFilter === 'only'

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

  const renderSessionRow = (summary: SessionSummary, depthPx: number) => {
    const pinned = pinnedSet.has(summary.id)
    const archived = archivedSet.has(summary.id)
    const menuOpen = sessionMenuId === summary.id
    const renaming = renamingSessionId === summary.id
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div
        className={clsx(ROWS.sessionRow, menuOpen && ROWS.menuOpen, archived && ROWS.archived)}
        style={indent(depthPx)}
        role="treeitem"
        onClick={() => { if (!archived) wsg.nav.openSession(summary.id) }}
      >
        <span className={ROWS.slot}>
          {!archived && summary.running && (
            <span className={ROWS.dot} style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--dsw-alias-state-success-primary, #59b077)' }} />
          )}
        </span>
        {renaming
          ? (
              <input
                autoFocus
                className={ROWS.renameInput}
                style={{ flex: 1 }}
                value={sessionRenameDraft}
                disabled={busy}
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
                className={ROWS.title}
                title={summary.displayTitle}
                onDoubleClick={event => { event.stopPropagation(); setRenamingSessionId(summary.id); setSessionRenameDraft(summary.displayTitle); setSessionMenuId(null) }}
              >
                {summary.displayTitle}
              </span>
            )}
        {!renaming && <span className={ROWS.time}>{formatRelative(summary.updatedAt, t)}</span>}
        {pinned && !archived && !renaming && (
          <span className={ROWS.pinIndicator}><Ico name="IconPinFillRegular" size={14} /></span>
        )}
        {!renaming && (
          <span className={ROWS.rowActions} onClick={stop}>
            {Menu && (
              <Menu
                open={menuOpen}
                onClose={() => setSessionMenuId(null)}
                portal
                closeOnPointerLeave
                anchor={(
                  <button
                    type="button"
                    className={ROWS.iconButton}
                    aria-label={t('more')}
                    onClick={event => { event.stopPropagation(); setSessionMenuId(menuOpen ? null : summary.id); setWsMenuPath(null) }}
                  >
                    <Ico name="IconEllipsisOutlineRegular" />
                  </button>
                )}
                items={archived
                  ? [
                      { id: 'rename', label: t('rename'), icon: <Ico name="IconEditOutlineRegular" size={14} /> },
                      { id: 'unarchive', label: t('unarchive'), icon: <Ico name="IconUnarchiveOutlineRegular" size={14} /> },
                    ]
                  : [
                      { id: pinned ? 'unpin' : 'pin', label: pinned ? t('unpin') : t('pin'), icon: <Ico name="IconPinOutlineRegular" size={14} /> },
                      { id: 'rename', label: t('rename'), icon: <Ico name="IconEditOutlineRegular" size={14} /> },
                      { id: 'fork', label: t('fork') },
                      { id: 'archive', label: t('archive'), icon: <Ico name="IconArchiveOutlineRegular" size={14} />, danger: true },
                    ]}
                onSelect={id => {
                  setSessionMenuId(null)
                  if (id === 'pin') void run(() => wsg.nav.pinSession(summary.id))
                  if (id === 'unpin') void run(() => wsg.nav.unpinSession(summary.id))
                  if (id === 'rename') { setRenamingSessionId(summary.id); setSessionRenameDraft(summary.displayTitle) }
                  if (id === 'fork') void run(() => wsg.nav.forkSession(summary.id))
                  if (id === 'archive') archiveSession(summary)
                  if (id === 'unarchive') void run(() => wsg.nav.unarchiveSession(summary.id))
                }}
              />
            )}
            {!archived && (
              <button
                type="button"
                className={ROWS.iconButton}
                aria-label={t('archive')}
                disabled={busy}
                onClick={event => { event.stopPropagation(); archiveSession(summary) }}
              >
                <Ico name="IconArchiveOutlineRegular" size={14} />
              </button>
            )}
            {!archived && (
              <button
                type="button"
                className={ROWS.iconButton}
                aria-label={pinned ? t('unpin') : t('pin')}
                disabled={busy}
                onClick={event => { event.stopPropagation(); void run(() => pinned ? wsg.nav.unpinSession(summary.id) : wsg.nav.pinSession(summary.id)) }}
              >
                <Ico name={pinned ? 'IconPinFillRegular' : 'IconPinOutlineRegular'} size={14} />
              </button>
            )}
          </span>
        )}
      </div>
    )
  }

  const renderWorkspaceRow = (
    path: string,
    opts: { fromGroupId: string | null; depth: number; groupItems: boolean },
  ) => {
    const { fromGroupId, depth, groupItems } = opts
    const workspace = byPath.get(path)
    const expandKey = `w:${path}`
    const rowOpen = expanded.has(expandKey)
    const sessions = workspace === undefined ? [] : sessionsOf(workspace)
    const menuOpen = wsMenuPath === path
    const renaming = renamingPath === path
    const confirming = confirmingPath === path
    const stripKeep = menuOpen || confirming || renaming
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div key={`${fromGroupId ?? 'root'}:${path}`}>
        <div
          className={clsx(ROWS.projectRow, stripKeep && ROWS.menuOpen)}
          style={indent(depth)}
          role="treeitem"
          aria-expanded={rowOpen}
          onClick={() => toggle(expandKey)}
        >
          <span className={clsx(ROWS.slot, ROWS.folder)}>
            {workspace === undefined
              ? null
              : rowOpen ? <Ico name="IconFolderOpenRegular" /> : <Ico name="IconFolderCloseRegular" />}
          </span>
          <span className={clsx(ROWS.slot, ROWS.chevron)}>
            {workspace !== undefined && (
              <Ico name="IconTriangleRightFillRegular" className={clsx(ROWS.arrow, rowOpen && ROWS.arrowOpen)} />
            )}
          </span>
          {renaming
            ? (
                <input
                  autoFocus
                  className={ROWS.renameInput}
                  style={{ width: 200 }}
                  value={renameDraft}
                  disabled={busy}
                  onClick={stop}
                  onKeyDown={event => {
                    if (event.key === 'Enter') commitWorkspaceRename(workspace)
                    if (event.key === 'Escape') { setRenamingPath(null); setRenameDraft('') }
                  }}
                  onBlur={() => commitWorkspaceRename(workspace)}
                />
              )
            : (
                <span className={ROWS.projectText}>
                  <span className={ROWS.title} style={workspace === undefined ? { opacity: 0.45 } : undefined}>
                    {workspace?.title ?? basename(path)}
                  </span>
                </span>
              )}
          {workspace === undefined && <span style={R.badge}>{t('unregistered')}</span>}
          <span className={ROWS.rowActions} onClick={stop}>
            {confirming
              ? (
                  <>
                    <button type="button" style={R.confirmBtn} disabled={busy}
                      onClick={event => { event.stopPropagation(); deleteWorkspace(workspace) }}>
                      {t('confirmDelete')}
                    </button>
                    <button type="button" style={R.cancelBtn} disabled={busy}
                      onClick={event => { event.stopPropagation(); setConfirmingPath(null) }}>
                      {t('cancel')}
                    </button>
                  </>
                )
              : (
                  <>
                    {Menu && (
                      <Menu
                        open={menuOpen}
                        onClose={() => setWsMenuPath(null)}
                        portal
                        closeOnPointerLeave
                        anchor={(
                          <button
                            type="button"
                            className={ROWS.iconButton}
                            aria-label={t('more')}
                            onClick={event => { event.stopPropagation(); setWsMenuPath(menuOpen ? null : path); setSessionMenuId(null) }}
                          >
                            <Ico name="IconEllipsisOutlineRegular" />
                          </button>
                        )}
                        items={[
                          { id: 'rename', label: t('rename'), icon: <Ico name="IconEditOutlineRegular" /> },
                          ...(groupItems
                            ? (groups ?? [])
                                .filter(group => group.id !== fromGroupId)
                                .map(group => ({ id: `move:${group.id}`, label: `${t('moveToGroup')} ${group.title}` }))
                            : []),
                          ...(groupItems && fromGroupId !== null
                            ? [{ id: 'remove', label: t('removeFromGroup'), danger: true }]
                            : []),
                          { id: 'delete', label: t('delete'), icon: <Ico name="IconTrashOutlineRegular" />, danger: true },
                        ]}
                        onSelect={id => {
                          setWsMenuPath(null)
                          if (id === 'rename') { setRenamingPath(path); setRenameDraft(workspace?.title ?? basename(path)); return }
                          if (id === 'delete') { setConfirmingPath(path); return }
                          if (id === 'remove' && fromGroupId !== null) { void run(async () => { await wsg.api.removeMember(fromGroupId, path); await refreshGroups() }); return }
                          if (id.startsWith('move:')) moveToGroup(path, fromGroupId, id.slice(5))
                        }}
                      />
                    )}
                    {workspace !== undefined && (
                      <button
                        type="button"
                        className={ROWS.iconButton}
                        aria-label={t('newSession')}
                        disabled={busy}
                        onClick={event => { event.stopPropagation(); wsg.nav.startSession(workspace.workspaceId) }}
                      >
                        <Ico name="IconNewChatOutlineRegular" />
                      </button>
                    )}
                  </>
                )}
          </span>
        </div>

        {rowOpen && workspace !== undefined && (
          <>
            {sessions.length === 0 && <div style={{ ...R.loading, paddingLeft: depth + 56 }}>{t('noSessions')}</div>}
            {sessions.map(summary => renderSessionRow(summary, depth + 16))}
          </>
        )}
      </div>
    )
  }

  const moveToGroup = (path: string, fromGroupId: string | null, groupId: string) => {
    void run(async () => {
      if (fromGroupId !== null) await wsg.api.removeMember(fromGroupId, path)
      await wsg.api.addMembers(groupId, [path])
      await refreshGroups()
    })
    setWsMenuPath(null)
  }

  const renderGroupHeader = (groupId: string, title: string, memberCount: number, expandKey: string, muted = false) => {
    const open = expanded.has(expandKey)
    const renaming = renamingGroupId === groupId
    const confirming = confirmingGroupId === groupId
    return (
      <div
        className={clsx(ROWS.projectRow, (groupMenuId === groupId || confirming) && ROWS.menuOpen)}
        style={indent(0)}
        role="treeitem"
        aria-expanded={open}
        onClick={() => { if (!renaming) toggle(expandKey) }}
      >
        <span className={clsx(ROWS.slot, ROWS.folder)}>
          {open ? <Ico name="IconFolderOpenRegular" /> : <Ico name="IconFolderCloseRegular" />}
        </span>
        <span className={clsx(ROWS.slot, ROWS.chevron)}>
          <Ico name="IconTriangleRightFillRegular" className={clsx(ROWS.arrow, open && ROWS.arrowOpen)} />
        </span>
        {renaming
          ? (
              <input
                autoFocus
                className={ROWS.renameInput}
                style={{ width: 180 }}
                value={groupRenameDraft}
                disabled={busy}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    const clean = groupRenameDraft.trim()
                    if (clean !== '') void run(() => wsg.api.rename(groupId, clean))
                    setRenamingGroupId(null)
                  }
                  if (event.key === 'Escape') setRenamingGroupId(null)
                }}
                onBlur={() => {
                  const clean = groupRenameDraft.trim()
                  if (clean !== '' && clean !== title) void run(() => wsg.api.rename(groupId, clean))
                  setRenamingGroupId(null)
                }}
              />
            )
          : (
              <span className={ROWS.projectText}>
                <span className={ROWS.title} style={muted ? { opacity: 0.8 } : undefined}>{title}</span>
              </span>
            )}
        <span style={R.count}>{t('membersCount', { count: memberCount })}</span>
        <span className={ROWS.rowActions} onClick={event => event.stopPropagation()}>
          {confirming
            ? (
                <>
                  <button type="button" style={R.confirmBtn} disabled={busy}
                    onClick={event => { event.stopPropagation(); void run(() => wsg.api.remove(groupId)); setConfirmingGroupId(null) }}>
                    {t('confirmDelete')}
                  </button>
                  <button type="button" style={R.cancelBtn} disabled={busy}
                    onClick={event => { event.stopPropagation(); setConfirmingGroupId(null) }}>
                    {t('cancel')}
                  </button>
                </>
              )
            : Menu && (
                <Menu
                  open={groupMenuId === groupId}
                  onClose={() => setGroupMenuId(null)}
                  portal
                  closeOnPointerLeave
                  anchor={(
                    <button
                      type="button"
                      className={ROWS.iconButton}
                      aria-label={t('more')}
                      onClick={event => { event.stopPropagation(); setGroupMenuId(groupMenuId === groupId ? null : groupId); setConfirmingGroupId(null) }}
                    >
                      <Ico name="IconEllipsisOutlineRegular" />
                    </button>
                  )}
                  items={[
                    { id: 'rename', label: t('rename'), icon: <Ico name="IconEditOutlineRegular" /> },
                    { id: 'delete', label: t('delete'), icon: <Ico name="IconTrashOutlineRegular" />, danger: true },
                  ]}
                  onSelect={id => {
                    setGroupMenuId(null)
                    if (id === 'rename') { setRenamingGroupId(groupId); setGroupRenameDraft(title) }
                    if (id === 'delete') setConfirmingGroupId(groupId)
                  }}
                />
              )}
        </span>
      </div>
    )
  }

  /** The official view-options dropdown: grouping / ordering / archived filter. */
  const renderViewOptionsMenu = () => {
    if (!Menu) return null
    return (
      <Menu
        open={viewMenuOpen}
        onClose={() => setViewMenuOpen(false)}
        portal
        dense
        align="end"
        listClassName={SHELL.viewOptionsMenu}
        selectedIds={[view.groupBy, view.orderBy, view.archivedFilter]}
        anchor={(
          <button
            type="button"
            className={SHELL.iconButton}
            aria-label={t('viewOptions.label')}
            onClick={event => { event.stopPropagation(); setViewMenuOpen(open => !open) }}
          >
            <Ico name="IconSlidersTwoOutlineRegular" />
          </button>
        )}
        items={[
          { type: 'label', id: 'group-by', text: t('groupBy.label') },
          { id: 'groups', label: t('groupBy.groups'), icon: <Ico name="IconPluginPinwheelOutlineRegular" /> },
          { id: 'workspace', label: t('groupBy.workspace'), icon: <Ico name="IconFolderCloseRegular" /> },
          { id: 'workspace-tree', label: t('groupBy.workspaceTree'), icon: <Ico name="IconWorkspaceTreeOutlineRegular" /> },
          { id: 'flat', label: t('groupBy.flat'), icon: <Ico name="IconFlatListOutlineRegular" /> },
          { type: 'separator', id: 'order-by-separator' },
          { type: 'label', id: 'order-by', text: t('orderBy.label') },
          { id: 'manual', label: t('orderBy.manual'), icon: <Ico name="IconChevronsUpDownOutlineRegular" /> },
          { id: 'updated', label: t('orderBy.updated'), icon: <Ico name="IconClockOutlineRegular" /> },
          { type: 'separator', id: 'archived-filter-separator' },
          { type: 'label', id: 'filter-by', text: t('filterBy.label') },
          { id: 'hide', label: t('viewOptions.hideArchived'), icon: <Ico name="IconArchiveOffOutlineRegular" /> },
          { id: 'show', label: t('viewOptions.showArchived'), icon: <Ico name="IconQueueOutlineRegular" /> },
          { id: 'only', label: t('viewOptions.onlyArchived'), icon: <Ico name="IconArchiveCheckOutlineRegular" /> },
        ]}
        onSelect={id => {
          setViewMenuOpen(false)
          if (id === 'groups' || id === 'workspace' || id === 'workspace-tree' || id === 'flat') setView({ groupBy: id })
          else if (id === 'manual' || id === 'updated') setView({ orderBy: id })
          else if (id === 'hide' || id === 'show' || id === 'only') setView({ archivedFilter: id })
        }}
      />
    )
  }

  let body: ReactNode
  if (view.groupBy === 'flat') {
    body = (
      <>
        {flatSessions.length === 0 && <div style={R.loading}>{t('noSessions')}</div>}
        {flatSessions.map(summary => renderSessionRow(summary, 8))}
      </>
    )
  } else if (view.groupBy === 'workspace') {
    body = (
      <>
        {orderedWorkspaces.map(workspace => (
          <Fragment key={workspace.workspaceId}>
            {renderWorkspaceRow(workspace.path, { fromGroupId: null, depth: 0, groupItems: false })}
          </Fragment>
        ))}
      </>
    )
  } else if (view.groupBy === 'workspace-tree' && tree !== null) {
    const renderTreeNode = (workspace: WorkspaceView, depth: number): ReactNode => {
      const children = tree.childrenOf(workspace.workspaceId)
      return (
        <Fragment key={workspace.workspaceId}>
          {renderWorkspaceRow(workspace.path, { fromGroupId: null, depth: depth * 12, groupItems: false })}
          {expanded.has(`w:${workspace.path}`) && (
            <>
              {sessionsOf(workspace).map(summary => renderSessionRow(summary, depth * 12 + 16))}
              {children.map(child => renderTreeNode(child, depth + 1))}
            </>
          )}
        </Fragment>
      )
    }
    body = <>{tree.roots.map(root => renderTreeNode(root, 0))}</>
  } else {
    // 'groups' — the custom-group mode.
    const groupSections = (groups ?? []).map(group => (
      <div className={SHELL.groupSection} key={group.id}>
        {renderGroupHeader(group.id, group.title, group.paths.length, `g:${group.id}`)}
        {expanded.has(`g:${group.id}`) && group.paths.map(path => renderWorkspaceRow(path, { fromGroupId: group.id, depth: 28, groupItems: true }))}
      </div>
    ))
    const ungroupedSection = ungrouped.length > 0 && (
      <div className={SHELL.groupSection}>
        {renderGroupHeader('ungrouped', t('ungrouped'), ungrouped.length, 'ungrouped', true)}
        {expanded.has('ungrouped') && ungrouped.map(workspace => renderWorkspaceRow(workspace.path, { fromGroupId: null, depth: 28, groupItems: true }))}
      </div>
    )
    body = <>{groupSections}{ungroupedSection}</>
  }

  const listEmpty = groups !== null && groups.length === 0 && ungrouped.length === 0 && view.groupBy === 'groups'

  return (
    <div className={SHELL.root} onClick={() => setConfirmingPath(null)}>
      <div className={SHELL.sectionHeader}>
        <span className={SHELL.sectionLabel}>{t('workspaceTitle')}</span>
        <span style={R.badge}>{t('panel')}</span>
        <div style={S.grow} />
        <div className={SHELL.headerActions}>
          {renderViewOptionsMenu()}
          <button type="button" className={SHELL.iconButton} title={t('addWorkspace')} disabled={busy || adding} onClick={addWorkspace}>
            <Ico name="IconFolderCloseRegular" size={16} />
          </button>
          <button
            type="button"
            className={SHELL.iconButton}
            title={t('useOfficialView')}
            onClick={() => {
              localStorage.setItem(MODE_KEY, 'official')
              location.reload()
            }}
          >
            <Ico name="IconFlatListOutlineRegular" size={16} />
          </button>
        </div>
      </div>

      {actionError !== null && <p style={{ ...S.error, margin: '0 12px 10px' }}>{actionError}</p>}

      {stopAsk !== null && (
        <div style={R.banner}>
          <span style={R.bannerText}>{t('stopAndArchiveAsk')} — {stopAsk.title}</span>
          <div style={S.grow} />
          <button type="button" style={R.confirmBtn} disabled={busy}
            onClick={() => { const ask = stopAsk; setStopAsk(null); void run(() => wsg.nav.archiveSessionStop(ask.sessionId)) }}>
            {t('stopAndArchive')}
          </button>
          <button type="button" style={R.cancelBtn} disabled={busy} onClick={() => setStopAsk(null)}>
            {t('cancel')}
          </button>
        </div>
      )}

      {groups === null && <div style={R.loading}>…</div>}

      {listEmpty && (
        <div className={SHELL.emptyState}>
          <span>{t('noGroups')}</span>
        </div>
      )}

      {archivedOnlyEmpty && flatSessions.length === 0 && view.groupBy === 'flat' && (
        <div className={SHELL.emptyState}>
          <Ico name="IconArchiveCheckOutlineRegular" size={24} />
          <span>{t('empty.noneArchived')}</span>
          <button type="button" className={SHELL.emptyAction} onClick={() => setView({ archivedFilter: 'hide' })}>
            {t('empty.viewOthers')}
          </button>
        </div>
      )}

      <div className={SHELL.list}>{body}</div>
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
