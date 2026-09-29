/**
 * 「分组」sidebar region: registers at priority -1 under `sidebar.workspaces`,
 * shadowing the official WorkspaceBrowser with a custom-group view over the
 * same official data services. The official browser entry stays live —
 * disposing this registration (settings mode switch or plugin disable)
 * restores the official view untouched. Adapted to dsh 0.2.0-rc.1 (official
 * CSS-module hashes unchanged from 0.1.7-rc.2; verified).
 *
 * Row actions are self-built — the renderer's boundRenderSlot rejects keys
 * not declared by our own entry (SlotOwnershipError), so official action
 * entries cannot be re-rendered here. Behavior mirrors the official browser:
 * view options (grouping/ordering/archived filter), search (250ms debounce,
 * sessions.search remote), pin/rename/fork/archive with stop-and-archive,
 * current-session selection highlight, hover actions, and drag for grouping
 * (pointer-based for directory rows, native for group headers) and ordering.
 * @module dsh-workspace-group-manager/client/region
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { WorkspaceGroup } from './api'
import type { WsgFace } from './face'
import { basename, formatRelative, PanelIcon, S } from './panel'
import type { SessionSummary, WorkspaceView } from './panel'
import { primitives, clsx } from './primitives'

/** localStorage keys (browser-local, official view state semantics). */
export const MODE_KEY = 'wsg.sidebarMode'
const VIEW_KEY = 'wsg.view.v1'

const SEARCH_DEBOUNCE_MS = 250
const NOTICE_HOLD_MS = 3000

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
  /** Layout panel-info hook (panelActive awareness for current selection). */
  usePanelInfo?: SnapshotHook
  /** Shell owner share: wide renders the full region, rail the icon column. */
  wide?: boolean
  expandSidebar?: () => void
}

/** Grouping modes: our custom groups + the official registry modes. */
type GroupBy = 'groups' | 'workspace' | 'workspace-tree' | 'flat'
type OrderBy = 'updated' | 'manual'
type ArchivedFilter = 'hide' | 'show' | 'only'
interface ViewOpts {
  groupBy: GroupBy
  orderBy: OrderBy
  archivedFilter: ArchivedFilter
  /** Expanded container keys (group:/w:/ungrouped), persisted browser-local. */
  expansion: Record<string, boolean>
}

const DEFAULT_VIEW: ViewOpts = { groupBy: 'groups', orderBy: 'updated', archivedFilter: 'hide', expansion: {} }

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
 * Official CSS-module class hashes (dsh-client-ui-workspace — identical in
 * 0.1.7-rc.2 and 0.2.0-rc.1; re-verify on upgrades).
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
  selected: 'YDXeBa_selected',
  renameInput: 'YDXeBa_renameInput',
  dropBefore: 'YDXeBa_dropBefore',
  dropAfter: 'YDXeBa_dropAfter',
  searchResultRow: 'YDXeBa_searchResultRow',
  searchResultHeading: 'YDXeBa_searchResultHeading',
  searchResultTitle: 'YDXeBa_searchResultTitle',
  searchResultMeta: 'YDXeBa_searchResultMeta',
  searchResultWorkspace: 'YDXeBa_searchResultWorkspace',
  searchResultSnippet: 'YDXeBa_searchResultSnippet',
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
  workspaceDropBefore: 'bhn1Oq_workspaceDropBefore',
  workspaceDropAfter: 'bhn1Oq_workspaceDropAfter',
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

/** Active drag inside the groups mode: a directory or a whole group. */
type RegionDrag =
  | { kind: 'dir'; path: string; fromGroupId: string | null }
  | { kind: 'group'; groupId: string }

/**
 * The grouped sidebar region. Rendered while `wsg.sidebarMode` is 'grouped';
 * the mode switch lives in the plugin's settings section.
 */
export function GroupedRegion(props: GroupedRegionProps) {
  const hasData = typeof props.useWorkspaces === 'function' && typeof props.useSessions === 'function'
  const fallback = useCallback((_selector: unknown) => undefined, [])
  const useWorkspacesHook = (props.useWorkspaces ?? fallback) as SnapshotHook
  const useSessionsHook = (props.useSessions ?? fallback) as SnapshotHook
  const usePanelInfoHook = (props.usePanelInfo ?? fallback) as SnapshotHook

  const items = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { items?: WorkspaceView[] } | null | undefined)?.items) ?? []) as WorkspaceView[]
  const archivedIds = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { archivedSessionIds?: readonly string[] } | null | undefined)?.archivedSessionIds) ?? []) as readonly string[]
  const pinnedIds = (useWorkspacesHook((snapshot: unknown) =>
    (snapshot as { pinnedSessionIds?: readonly string[] } | null | undefined)?.pinnedSessionIds) ?? []) as readonly string[]
  const byId = (useSessionsHook((snapshot: unknown) =>
    (snapshot as { byId?: Record<string, SessionSummary> } | null | undefined)?.byId) ?? {}) as Record<string, SessionSummary>
  const panelActive = ((usePanelInfoHook((info: unknown) =>
    (info as { activePanelId?: unknown } | null | undefined)?.activePanelId != null)) ?? false) as boolean

  const currentSessionId = useMemo(() => {
    if (panelActive) return undefined
    return Object.values(byId).find(summary => ((summary.retainedBy as { mainView?: number } | undefined)?.mainView ?? 0) > 0)?.id
  }, [byId, panelActive])

  if (props.wide === false) return <RailStub expandSidebar={props.expandSidebar} />

  return (
    <RegionBody
      {...props}
      hasData={hasData}
      items={items}
      archivedIds={archivedIds}
      pinnedIds={pinnedIds}
      byId={byId}
      currentSessionId={currentSessionId}
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
    currentSessionId: string | undefined
  },
) {
  const { wsg, t = key => key, items, archivedIds, pinnedIds, byId, currentSessionId } = props
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
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [createGroupDraft, setCreateGroupDraft] = useState('')
  const [view, setViewState] = useState<ViewOpts>(loadView)
  const [drag, setDrag] = useState<RegionDrag | null>(null)
  const [dropMark, setDropMark] = useState<{ key: string; half: 'before' | 'after' } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SessionSummary[] | null>(null)
  const [searchSnippets, setSearchSnippets] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ text: string; seq: number } | null>(null)
  const groupsRef = useRef<WorkspaceGroup[]>([])
  groupsRef.current = groups ?? []
  const pointerDragRef = useRef<{ path: string; fromGroupId: string | null; startX: number; startY: number; active: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const noticeTimer = useRef<number | undefined>(undefined)

  const setView = useCallback((patch: Partial<ViewOpts>) => {
    setViewState(previous => {
      const next = { ...previous, ...patch }
      saveView(next)
      return next
    })
  }, [])

  const expanded = view.expansion ?? {}
  const isOpen = useCallback((key: string) => (view.expansion ?? {})[key] === true, [view.expansion])
  const setExpandedKey = useCallback((key: string, open: boolean) => {
    setView({ expansion: { ...(view.expansion ?? {}), [key]: open } })
  }, [setView, view.expansion])

  const showNotice = useCallback((text: string) => {
    setNotice({ text, seq: Date.now() })
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_HOLD_MS)
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
    setExpandedKey(key, !isOpen(key))
  }, [isOpen, setExpandedKey])

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

  const startCreateGroup = useCallback(() => {
    setCreatingGroup(true)
    setCreateGroupDraft('')
  }, [])

  const commitCreateGroup = useCallback(() => {
    const title = createGroupDraft.trim()
    setCreatingGroup(false)
    setCreateGroupDraft('')
    if (title === '') return
    void run(async () => {
      const created = await wsg.api.create(title)
      if (created.ok) setExpandedKey(`g:${created.value.group.id}`, true)
      await refreshGroups()
    })
  }, [createGroupDraft, refreshGroups, run, setExpandedKey, wsg.api])

  /** One workspace's sessions under the current ordering + archived filter. */
  const sessionsOf = useCallback((workspace: WorkspaceView): SessionSummary[] => {
    const all = workspace.sessionIds
      .map(id => byId[id])
      .filter((summary): summary is SessionSummary => summary !== undefined && !summary.blank && summary.origin !== 'subagent')
    const normal = all.filter(summary => !archivedSet.has(summary.id))
    const archived = all.filter(summary => archivedSet.has(summary.id)).sort((a, b) => b.updatedAt - a.updatedAt)
    let list: SessionSummary[]
    if (view.archivedFilter === 'only') list = archived
    else if (view.archivedFilter === 'show') list = [...archived, ...normal]
    else list = normal
    const pinned = list.filter(summary => pinnedSet.has(summary.id))
    const rest = list.filter(summary => !pinnedSet.has(summary.id))
    if (view.orderBy === 'updated') rest.sort((a, b) => b.updatedAt - a.updatedAt)
    else rest.sort((a, b) => workspace.sessionIds.indexOf(a.id) - workspace.sessionIds.indexOf(b.id))
    return [...pinned, ...rest]
  }, [byId, archivedSet, pinnedSet, view.archivedFilter, view.orderBy])

  /** Sessions that belong to no registered workspace (the Ungrouped bucket). */
  const freeSessions = useMemo((): SessionSummary[] => {
    const accounted = new Set(items.flatMap(workspace => workspace.sessionIds))
    const all = Object.values(byId)
      .filter((summary): summary is SessionSummary => summary !== undefined && !summary.blank && summary.origin !== 'subagent' && !accounted.has(summary.id))
    const normal = all.filter(summary => !archivedSet.has(summary.id))
    const archived = all.filter(summary => archivedSet.has(summary.id)).sort((a, b) => b.updatedAt - a.updatedAt)
    if (view.archivedFilter === 'only') return archived
    if (view.archivedFilter === 'show') return [...archived, ...normal]
    return normal
  }, [items, byId, archivedSet, view.archivedFilter])

  /** Flat single-list sessions across all workspaces + the free bucket. */
  const flatSessions = useMemo((): SessionSummary[] => {
    const order = new Map<string, number>()
    items.forEach(workspace => workspace.sessionIds.forEach(id => { if (!order.has(id)) order.set(id, order.size) }))
    Object.keys(byId).forEach(id => { if (!order.has(id)) order.set(id, order.size) })
    const all = [...order.keys()]
      .map(id => byId[id])
      .filter((summary): summary is SessionSummary => summary !== undefined && !summary.blank && summary.origin !== 'subagent')
    const normal = all.filter(summary => !archivedSet.has(summary.id))
    const archived = all.filter(summary => archivedSet.has(summary.id)).sort((a, b) => b.updatedAt - a.updatedAt)
    let list: SessionSummary[]
    if (view.archivedFilter === 'only') list = archived
    else if (view.archivedFilter === 'show') list = [...archived, ...normal]
    else list = normal
    const pinned = list.filter(summary => pinnedSet.has(summary.id))
    const rest = list.filter(summary => !pinnedSet.has(summary.id))
    if (view.orderBy === 'updated') rest.sort((a, b) => b.updatedAt - a.updatedAt)
    else rest.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
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

  // --- search (sessions.search remote, 250ms debounce) --------------------

  useEffect(() => {
    if (!searchOpen) { setSearchResults(null); return }
    const query = searchQuery.trim()
    if (query === '') { setSearchResults(null); setSearching(false); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true)
      wsg.nav.search(query, controller.signal).then(result => {
        if (controller.signal.aborted) return
        const rows = result.items
          .map(item => ({ summary: byId[item.sessionId], snippet: item.snippet }))
          .filter((row): row is { summary: SessionSummary; snippet: string } => row.summary !== undefined)
        setSearchResults(rows.map(row => row.summary))
        setSearchSnippets(Object.fromEntries(rows.map(row => [row.summary.id, row.snippet])))
      }).catch(() => {
        if (!controller.signal.aborted) setSearchResults([])
      }).finally(() => {
        if (!controller.signal.aborted) setSearching(false)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [searchOpen, searchQuery, byId, wsg.nav])

  // --- drag & drop ---------------------------------------------------------
  // Directory rows: pointer-based drag (native HTML5 drag proved unreliable
  // for these rows here). Group headers: native HTML5 drag (proven reliable).
  // Group drag value flows through dataTransfer; directory drags commit via
  // the pointer state.

  const clearDrag = useCallback(() => {
    setDrag(null)
    setDropMark(null)
  }, [])

  const groupDragStart = (groupId: string) => (event: ReactDragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', groupId)
    setDrag({ kind: 'group', groupId })
    setWsMenuPath(null)
    setSessionMenuId(null)
    setGroupMenuId(null)
  }

  const endDrag = useCallback(() => clearDrag(), [clearDrag])

  const isRealGroup = (groupId: string) => groupId !== 'ungrouped'
  const isGroupDragValue = (value: string) => (groupsRef.current ?? []).some(group => group.id === value)

  const groupHeaderDragOver = (groupId: string) => (event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('text/plain')) return
    if (drag?.kind === 'group' && drag.groupId === groupId) return
    if (drag?.kind === 'dir' && drag.fromGroupId === groupId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDropMark({ key: `group:${groupId}`, half: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
  }

  const groupHeaderDrop = (groupId: string) => (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const value = event.dataTransfer.getData('text/plain')
    const rect = event.currentTarget.getBoundingClientRect()
    const half: 'before' | 'after' = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    clearDrag()
    if (value === '') return
    if (isGroupDragValue(value)) {
      if (value === groupId) return
      const ids = (groupsRef.current ?? []).map(group => group.id).filter(id => id !== value)
      const index = Math.max(0, ids.indexOf(groupId)) + (half === 'after' ? 1 : 0)
      const next = [...ids.slice(0, index), value, ...ids.slice(index)]
      void run(async () => {
        await wsg.api.reorderGroups(next)
        await refreshGroups()
      })
      return
    }
    // Directory dropped on a group header: move it into that group.
    const targetGroup = (groupsRef.current ?? []).find(group => group.id === groupId)
    if (targetGroup === undefined) return
    setExpandedKey(`g:${groupId}`, true)
    void run(async () => {
      for (const group of groupsRef.current ?? []) {
        if (group.id !== groupId && group.paths.includes(value)) await wsg.api.removeMember(group.id, value)
      }
      const afterAdd = await wsg.api.addMembers(groupId, [value])
      if (half === 'before' && afterAdd.ok && targetGroup.paths.length > 0) {
        await wsg.api.reorderMembers(groupId, [value, ...targetGroup.paths])
      }
      await refreshGroups()
    })
  }

  const ungroupedHeaderDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('text/plain')) return
    if (drag?.kind === 'group') return
    if (drag?.kind === 'dir' && drag.fromGroupId === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDropMark({ key: 'group:ungrouped', half: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
  }

  const ungroupedHeaderDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const value = event.dataTransfer.getData('text/plain')
    const current = drag
    clearDrag()
    if (value === '' || isGroupDragValue(value)) return
    const sourceGroupId = current?.kind === 'dir' ? current.fromGroupId : null
    void run(async () => {
      for (const group of groupsRef.current ?? []) {
        if (group.paths.includes(value)) await wsg.api.removeMember(group.id, value)
      }
      if (sourceGroupId !== null) await refreshGroups()
    })
  }

  /** Pointer drag for directory rows: mousedown → threshold → hit-test → mouseup commit. */
  const onDirRowMouseDown = (path: string, fromGroupId: string | null) => (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button, input')) return
    suppressClickRef.current = false
    const startX = event.clientX
    const startY = event.clientY
    const state = { path, fromGroupId, startX, startY, active: false }
    pointerDragRef.current = state
    const onMove = (move: MouseEvent) => {
      if (pointerDragRef.current !== state) return
      if (!state.active) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < 5) return
        state.active = true
        setDrag({ kind: 'dir', path, fromGroupId })
        setWsMenuPath(null)
        setSessionMenuId(null)
        setGroupMenuId(null)
      }
      move.preventDefault()
      const hit = document.elementFromPoint(move.clientX, move.clientY)?.closest('[data-wsg-drop]') as HTMLElement | null
      if (hit === null) { setDropMark(null); return }
      const rect = hit.getBoundingClientRect()
      const dirPath = hit.getAttribute('data-wsg-dir')
      const groupId = hit.getAttribute('data-wsg-group')
      setDropMark({ key: dirPath !== null ? `dir:${dirPath}` : `group:${groupId}`, half: move.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
    }
    const onUp = (up: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (pointerDragRef.current !== state) return
      pointerDragRef.current = null
      const wasActive = state.active
      setDrag(null)
      setDropMark(null)
      if (!wasActive) return
      suppressClickRef.current = true
      const hit = document.elementFromPoint(up.clientX, up.clientY)?.closest('[data-wsg-drop]') as HTMLElement | null
      if (hit === null) return
      const dirPath = hit.getAttribute('data-wsg-dir')
      const groupId = hit.getAttribute('data-wsg-group')
      const owner = hit.getAttribute('data-wsg-owner')
      const rect = hit.getBoundingClientRect()
      commitPointerDrop(
        path,
        fromGroupId,
        dirPath,
        dirPath !== null ? (owner !== null && owner !== '' ? owner : groupId) : groupId,
        up.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
      )
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    event.preventDefault()
  }

  /** Commit one pointer drag drop. groupId refers to the hit target's group. */
  const commitPointerDrop = (
    path: string,
    fromGroupId: string | null,
    dirPath: string | null,
    groupId: string | null,
    half: 'before' | 'after',
  ) => {
    if (dirPath !== null) {
      if (dirPath === path) return
      const ownerGroupId = groupId
      if (ownerGroupId === null) return
      const targetGroup = groupsRef.current.find(group => group.id === ownerGroupId)
      if (targetGroup === undefined) return
      const sourceGroupId = targetGroup.paths.includes(path)
        ? ownerGroupId
        : (groupsRef.current.find(group => group.paths.includes(path))?.id ?? null)
      const without = targetGroup.paths.filter(p => p !== path)
      const index = Math.max(0, without.indexOf(dirPath)) + (half === 'after' ? 1 : 0)
      const order = [...without.slice(0, index), path, ...without.slice(index)]
      if (sourceGroupId === ownerGroupId) {
        void run(async () => {
          await wsg.api.reorderMembers(ownerGroupId, order)
          await refreshGroups()
        })
      } else {
        void run(async () => {
          if (sourceGroupId !== null) await wsg.api.removeMember(sourceGroupId, path)
          await wsg.api.addMembers(ownerGroupId, [path])
          await wsg.api.reorderMembers(ownerGroupId, order)
          await refreshGroups()
        })
      }
      return
    }
    if (groupId === null) return
    if (groupId === 'ungrouped') {
      if (fromGroupId === null) return
      setExpandedKey('ungrouped', true)
      void run(async () => {
        await wsg.api.removeMember(fromGroupId, path)
        await refreshGroups()
      })
      return
    }
    const targetGroup = groupsRef.current.find(group => group.id === groupId)
    if (targetGroup === undefined) return
    setExpandedKey(`g:${groupId}`, true)
    void run(async () => {
      if (fromGroupId !== null) await wsg.api.removeMember(fromGroupId, path)
      const afterAdd = await wsg.api.addMembers(groupId, [path])
      if (half === 'before' && afterAdd.ok && targetGroup.paths.length > 0) {
        await wsg.api.reorderMembers(groupId, [path, ...targetGroup.paths])
      }
      await refreshGroups()
    })
  }

  const renderSessionRow = (summary: SessionSummary, depthPx: number) => {
    const pinned = pinnedSet.has(summary.id)
    const archived = archivedSet.has(summary.id)
    const menuOpen = sessionMenuId === summary.id
    const renaming = renamingSessionId === summary.id
    const selected = currentSessionId === summary.id
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div
        className={clsx(ROWS.sessionRow, selected && ROWS.selected, menuOpen && ROWS.menuOpen, archived && ROWS.archived)}
        style={indent(depthPx)}
        role="treeitem"
        aria-selected={selected}
        onClick={() => { if (archived) { showNotice(t('archivedNotOpenable')); return } wsg.nav.openSession(summary.id) }}
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
    const rowOpen = isOpen(expandKey)
    const sessions = workspace === undefined ? [] : sessionsOf(workspace)
    const hiddenByOnly = view.archivedFilter === 'only' && sessions.length === 0
    if (hiddenByOnly) return null
    const menuOpen = wsMenuPath === path
    const renaming = renamingPath === path
    const confirming = confirmingPath === path
    const stripKeep = menuOpen || confirming || renaming
    const draggingThis = drag?.kind === 'dir' && drag.path === path
    const markerBefore = dropMark?.key === `dir:${path}` && dropMark.half === 'before'
    const markerAfter = dropMark?.key === `dir:${path}` && dropMark.half === 'after'
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div key={`${fromGroupId ?? 'root'}:${path}`}>
        <div
          className={clsx(
            ROWS.projectRow,
            stripKeep && ROWS.menuOpen,
            markerBefore && ROWS.dropBefore,
            markerAfter && ROWS.dropAfter,
          )}
          style={{ ...indent(depth), ...(draggingThis ? { opacity: 0.45 } : null) }}
          role="treeitem"
          aria-expanded={rowOpen}
          data-wsg-drop={groupItems ? '' : undefined}
          data-wsg-dir={groupItems ? path : undefined}
          data-wsg-owner={groupItems ? (fromGroupId ?? '') : undefined}
          onMouseDown={groupItems ? onDirRowMouseDown(path, fromGroupId) : undefined}
          onClick={() => {
            if (suppressClickRef.current) { suppressClickRef.current = false; return }
            toggle(expandKey)
          }}
        >
          <span className={clsx(ROWS.slot, ROWS.folder, workspace !== undefined && containsCurrent(workspace) && ROWS.folderActive)}>
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

  const containsCurrent = (workspace: WorkspaceView): boolean =>
    currentSessionId !== undefined && workspace.sessionIds.includes(currentSessionId)

  const moveToGroup = (path: string, fromGroupId: string | null, groupId: string) => {
    void run(async () => {
      if (fromGroupId !== null) await wsg.api.removeMember(fromGroupId, path)
      await wsg.api.addMembers(groupId, [path])
      await refreshGroups()
    })
    setWsMenuPath(null)
  }

  const renderGroupHeader = (groupId: string, title: string, memberCount: number, expandKey: string, muted = false) => {
    const open = isOpen(expandKey)
    const renaming = renamingGroupId === groupId
    const confirming = confirmingGroupId === groupId
    const isRealGroup = groupId !== 'ungrouped'
    const draggingThisGroup = isRealGroup && drag?.kind === 'group' && drag.groupId === groupId
    const markerBefore = dropMark?.key === `group:${groupId}` && dropMark.half === 'before'
    const markerAfter = dropMark?.key === `group:${groupId}` && dropMark.half === 'after'
    return (
      <div
        className={clsx(
          ROWS.projectRow,
          (groupMenuId === groupId || confirming) && ROWS.menuOpen,
          markerBefore && SHELL.workspaceDropBefore,
          markerAfter && SHELL.workspaceDropAfter,
        )}
        style={{ ...indent(0), ...(draggingThisGroup ? { opacity: 0.45 } : null) }}
        role="treeitem"
        aria-expanded={open}
        data-wsg-drop=""
        data-wsg-group={groupId}
        onClick={() => { if (!renaming) toggle(expandKey) }}
        draggable={isRealGroup}
        onDragStart={isRealGroup ? groupDragStart(groupId) : undefined}
        onDragEnd={isRealGroup ? endDrag : undefined}
        onDragOver={isRealGroup ? groupHeaderDragOver(groupId) : ungroupedHeaderDragOver}
        onDrop={isRealGroup ? groupHeaderDrop(groupId) : ungroupedHeaderDrop}
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
  if (searchOpen && searchQuery.trim() !== '') {
    body = (
      <>
        {searching && searchResults === null && <div style={R.loading}>{t('searching')}</div>}
        {!searching && searchResults !== null && searchResults.length === 0 && <div style={R.loading}>{t('searchNoResults')}</div>}
        {(searchResults ?? []).map(summary => {
          const archived = archivedSet.has(summary.id)
          const owning = items.find(workspace => workspace.sessionIds.includes(summary.id))
          return (
            <div
              key={summary.id}
              className={clsx(ROWS.searchResultRow, archived && ROWS.archived)}
              role="treeitem"
              onClick={() => {
                if (archived) { showNotice(t('archivedNotOpenable')); return }
                wsg.nav.openSession(summary.id)
              }}
            >
              <div className={ROWS.searchResultHeading}>
                <span className={ROWS.searchResultTitle}>{summary.displayTitle}</span>
              </div>
              <div className={ROWS.searchResultMeta}>
                {owning !== undefined && <span className={ROWS.searchResultWorkspace}>{owning.title}</span>}
                <span className={ROWS.searchResultSnippet}>{searchSnippets[summary.id] ?? ''}</span>
              </div>
            </div>
          )
        })}
      </>
    )
  } else if (view.groupBy === 'flat') {
    body = (
      <>
        {flatSessions.length === 0 && <div style={R.loading}>{t('noSessions')}</div>}
        {flatSessions.map(summary => renderSessionRow(summary, 8))}
      </>
    )
  } else if (view.groupBy === 'workspace') {
    const visible = orderedWorkspaces.filter(workspace => !(view.archivedFilter === 'only' && sessionsOf(workspace).length === 0))
    body = (
      <>
        {visible.map(workspace => (
          <Fragment key={workspace.workspaceId}>
            {renderWorkspaceRow(workspace.path, { fromGroupId: null, depth: 0, groupItems: false })}
          </Fragment>
        ))}
        {freeSessions.length > 0 && (
          <div className={SHELL.groupSection}>
            {renderGroupHeader('ungrouped', t('ungrouped'), freeSessions.length, 'ungrouped', true)}
            {isOpen('ungrouped') && freeSessions.map(summary => renderSessionRow(summary, 16))}
          </div>
        )}
      </>
    )
  } else if (view.groupBy === 'workspace-tree' && tree !== null) {
    const renderTreeNode = (workspace: WorkspaceView, depth: number): ReactNode => {
      const children = tree.childrenOf(workspace.workspaceId)
      return (
        <Fragment key={workspace.workspaceId}>
          {renderWorkspaceRow(workspace.path, { fromGroupId: null, depth: depth * 12, groupItems: false })}
          {isOpen(`w:${workspace.path}`) && (
            <>
              {sessionsOf(workspace).map(summary => renderSessionRow(summary, depth * 12 + 16))}
              {children.map(child => renderTreeNode(child, depth + 1))}
            </>
          )}
        </Fragment>
      )
    }
    body = (
      <>
        {tree.roots.map(root => renderTreeNode(root, 0))}
        {freeSessions.length > 0 && (
          <div className={SHELL.groupSection}>
            {renderGroupHeader('ungrouped', t('ungrouped'), freeSessions.length, 'ungrouped', true)}
            {isOpen('ungrouped') && freeSessions.map(summary => renderSessionRow(summary, 16))}
          </div>
        )}
      </>
    )
  } else {
    const groupSections = (groups ?? []).map(group => {
      const members = group.paths
        .map(path => renderWorkspaceRow(path, { fromGroupId: group.id, depth: 28, groupItems: true }))
        .filter(node => node !== null)
      if (view.archivedFilter === 'only' && members.length === 0) return null
      return (
        <div className={SHELL.groupSection} key={group.id}>
          {renderGroupHeader(group.id, group.title, group.paths.length, `g:${group.id}`)}
          {isOpen(`g:${group.id}`) && members}
        </div>
      )
    })
    const ungroupedSection = ungrouped.length > 0 && (
      <div className={SHELL.groupSection}>
        {renderGroupHeader('ungrouped', t('ungrouped'), ungrouped.length, 'ungrouped', true)}
        {isOpen('ungrouped') && ungrouped.map(workspace => renderWorkspaceRow(workspace.path, { fromGroupId: null, depth: 28, groupItems: true }))}
      </div>
    )
    body = <>{groupSections}{ungroupedSection}</>
  }

  const listEmpty = groups !== null && groups.length === 0 && ungrouped.length === 0 && view.groupBy === 'groups'

  return (
    <div className={SHELL.root} onClick={() => setConfirmingPath(null)}>
      <style>{[
        // Official dropBefore/dropAfter markers only style .sessionRow; the
        // directory rows here are .projectRow, so give them the same lines.
        '.YDXeBa_projectRow.YDXeBa_dropBefore,.YDXeBa_projectRow.YDXeBa_dropAfter{position:relative}',
        '.YDXeBa_projectRow.YDXeBa_dropBefore:before,.YDXeBa_projectRow.YDXeBa_dropAfter:after{content:"";z-index:1;background:var(--dsw-alias-state-business-primary,#4d78cc);pointer-events:none;height:2px;position:absolute;left:0;right:0}',
        '.YDXeBa_projectRow.YDXeBa_dropBefore:before{top:-1px}',
        '.YDXeBa_projectRow.YDXeBa_dropAfter:after{bottom:-1px}',
      ].join('\n')}</style>
      <div className={SHELL.sectionHeader}>
        <span className={SHELL.sectionLabel}>{t('workspaceTitle')}</span>
        <span style={R.badge}>{t('panel')}</span>
        <div style={S.grow} />
        <button
          type="button"
          className={SHELL.iconButton}
          title={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          onClick={event => { event.stopPropagation(); setSearchOpen(true) }}
        >
          <Ico name="IconSearchOutlineRegular" />
        </button>
        <button
          type="button"
          className={SHELL.iconButton}
          title={t('createGroup')}
          aria-label={t('createGroup')}
          disabled={busy}
          onClick={event => { event.stopPropagation(); startCreateGroup() }}
        >
          <Ico name="IconPlusOutlineRegular" size={16} />
        </button>
        {renderViewOptionsMenu()}
        <button type="button" className={SHELL.iconButton} title={t('addWorkspace')} disabled={busy || adding} onClick={addWorkspace}>
          <Ico name="IconFolderCloseRegular" size={16} />
        </button>
      </div>

      {creatingGroup && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 12px 10px' }}>
          <input
            autoFocus
            style={{ ...S.input, flex: 1 }}
            value={createGroupDraft}
            placeholder={t('createGroup')}
            disabled={busy}
            onChange={event => setCreateGroupDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commitCreateGroup()
              if (event.key === 'Escape') { setCreatingGroup(false); setCreateGroupDraft('') }
            }}
          />
          <button type="button" style={R.cancelBtn} disabled={busy}
            onClick={() => { setCreatingGroup(false); setCreateGroupDraft('') }}>
            {t('cancel')}
          </button>
        </div>
      )}

      {searchOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 12px 10px' }}>
          <input
            autoFocus
            style={{ ...S.input, flex: 1 }}
            value={searchQuery}
            placeholder={t('search.placeholder')}
            onChange={event => setSearchQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults(null) }
            }}
          />
          <button type="button" style={R.cancelBtn} onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults(null) }}>
            {t('cancel')}
          </button>
        </div>
      )}

      {actionError !== null && <p style={{ ...S.error, margin: '0 12px 10px' }}>{actionError}</p>}

      {notice !== null && (
        <div style={{ ...R.banner, background: 'rgba(127,140,158,0.16)' }}>
          <span style={R.bannerText}>{notice.text}</span>
        </div>
      )}

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

      <div className={SHELL.list}>{body}</div>
    </div>
  )
}
