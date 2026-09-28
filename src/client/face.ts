/**
 * Shared injectable face for the plugin's client surfaces (groups panel +
 * sidebar region). Structural only — the plugin body (index.tsx) binds these
 * to cordis services at apply time; no DSH package is imported at runtime.
 * @module dsh-workspace-group-manager/client/face
 */

import type { groupsApi } from './api'

/** Everything a client surface of this plugin receives via its inject face. */
export interface WsgFace {
  api: typeof groupsApi
  /** Cross-panel navigation + session operations, bound to ctx.uiWorkspace / ctx.sessions. */
  nav: {
    openSession(sessionId: string): void
    startSession(workspaceId?: string): void
    renameSession(sessionId: string, title: string): Promise<unknown>
    forkSession(sessionId: string): Promise<unknown>
    pinSession(sessionId: string): Promise<unknown>
    unpinSession(sessionId: string): Promise<unknown>
    /** Plain archive; rejects when the session still runs (offer stop-and-archive). */
    archiveSession(sessionId: string): Promise<unknown>
    /** Archive after the host stopped the session's running work. */
    archiveSessionStop(sessionId: string): Promise<unknown>
    unarchiveSession(sessionId: string): Promise<unknown>
  }
  /** Official workspace mutations, bound to ctx.workspaces / ctx.uiWorkspace. */
  ws: {
    /** Register an existing directory (pickDirectory → create). */
    create(path: string): Promise<unknown>
    rename(workspaceId: string, title: string): Promise<unknown>
    remove(workspaceId: string): Promise<unknown>
    /** Host-native directory picker; null when cancelled. */
    pickDirectory(): Promise<string | null>
  }
}
