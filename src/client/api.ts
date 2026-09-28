/**
 * Browser client for the host /workspace-group-manager/* routes: typed JSON
 * envelope calls over same-origin relative fetch (document-relative paths —
 * the GUI serves with `<base href="./">`, so a leading slash would escape the
 * deployment prefix).
 * @module dsh-workspace-group-manager/client/api
 */

/** Stable machine-readable error, mirroring the host envelope. */
export interface WsgError {
  code: 'internal' | 'invalid' | 'not-found' | 'conflict' | 'forbidden' | 'unavailable'
  message: string
}

/** One persisted group: a title plus member workspace directory paths. */
export interface WorkspaceGroup {
  id: string
  title: string
  paths: string[]
  createdAt: string
  updatedAt: string
}

export interface ListResult {
  groups: WorkspaceGroup[]
  /** Set when the store recovered from a corrupt file (backup path). */
  notice: string | null
}

/** One /workspace-group-manager envelope response. */
export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WsgError }

const TRANSPORT_ERROR: WsgError = { code: 'unavailable', message: 'workspace-group-manager route unavailable' }

/**
 * POST one JSON payload and decode the envelope; never throws.
 * @param route - route suffix under the /workspace-group-manager prefix.
 */
async function post<T>(route: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`workspace-group-manager/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
  try {
    const envelope = await response.json() as unknown
    if (typeof envelope !== 'object' || envelope === null) return { ok: false, error: TRANSPORT_ERROR }
    const record = envelope as Record<string, unknown>
    if (record.ok === true) return { ok: true, value: record.value as T }
    const error = record.error as WsgError | undefined
    return { ok: false, error: error ?? TRANSPORT_ERROR }
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
}

/** Typed group management operations over the wire. */
export const groupsApi = {
  list(): Promise<ApiResult<ListResult>> {
    return post<ListResult>('list', {})
  },
  create(title: string): Promise<ApiResult<{ group: WorkspaceGroup }>> {
    return post('create', { title })
  },
  rename(id: string, title: string): Promise<ApiResult<{ group: WorkspaceGroup }>> {
    return post('rename', { id, title })
  },
  remove(id: string): Promise<ApiResult<{ removed: boolean }>> {
    return post('delete', { id })
  },
  addMembers(id: string, paths: string[]): Promise<ApiResult<{ group: WorkspaceGroup }>> {
    return post('add-members', { id, paths })
  },
  removeMember(id: string, path: string): Promise<ApiResult<{ group: WorkspaceGroup }>> {
    return post('remove-member', { id, path })
  },
}
