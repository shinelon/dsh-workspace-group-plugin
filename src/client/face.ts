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
  /** Cross-panel navigation, bound to ctx.uiWorkspace. */
  nav: {
    openSession(sessionId: string): void
    startSession(workspaceId?: string): void
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
