/**
 * Workspace-group plugin, browser half. The grouped sidebar region: while
 * `wsg.sidebarMode` is not 'official', shadows the official WorkspaceBrowser
 * under `sidebar.workspaces` at priority -1; otherwise registers a small
 * `sidebar.footer.action` sentinel that switches back. The mode flag is read
 * at apply time; switching reloads the page. All group and directory
 * management lives in the region itself.
 * @module dsh-workspace-group-manager/client
 */

import { groupsApi } from './api'
import { GroupedRegion, MODE_KEY, OfficialModeSentinel } from './region'
import { NS, zh, en } from './locales'

/** The locale namespace owned by this plugin. */
export const NS_WSG = NS

/** Minimal structural type of the client context this plugin touches. */
interface ClientContext {
  effect(fn: () => (() => void) | void, label: string): void
  inject(services: readonly string[], fn: (scope: any) => void): void
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): (key: string, vars?: Record<string, string | number>) => string
  }
}

/** Minimal structural type of the slots registry surface used here. */
interface SlotRegistry {
  /** Run `ready` once the named slot is declared; the return value disposes the wait. */
  inject(slot: string, ready: () => (() => void) | void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** Client services required before this module's apply runs. */
export const inject = ['slots', 'locale']

function sidebarMode(): 'grouped' | 'official' {
  try {
    return localStorage.getItem(MODE_KEY) === 'official' ? 'official' : 'grouped'
  } catch {
    return 'grouped'
  }
}

/**
 * Client plugin body: dictionaries, then the region registration with the
 * injected navigation/mutation face. Slot declarations come from
 * ui-layout/ui-sidebar and the services (uiWorkspace, workspaces model) from
 * their owners — activation order is not constrained, so every wait is
 * declaration/service aware.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'workspace-group-manager: dictionaries')

  const t = ctx.locale.bind(NS)

  ctx.inject(['slots', 'uiWorkspace', 'workspaces', 'sessions'], (scope: {
    slots: SlotRegistry
    uiWorkspace: {
      openSession(target: unknown): void
      startSession(workspaceId?: unknown): void
      pickDirectory(): Promise<string | null>
      forkSession(sessionId: unknown): Promise<unknown>
      pinSession(sessionId: unknown): Promise<unknown>
      unpinSession(sessionId: unknown): Promise<unknown>
    }
    workspaces: {
      create(input: { path: string }): Promise<unknown>
      rename(workspaceId: string, title: string): Promise<unknown>
      delete(workspaceId: string): Promise<unknown>
      archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<unknown>
      unarchiveSession(sessionId: string): Promise<unknown>
    }
    sessions: {
      rename(sessionId: string, title: string): Promise<unknown>
    }
  }) => {
    const slots = scope.slots
    const wsg = {
      api: groupsApi,
      nav: {
        openSession: (sessionId: string) => { scope.uiWorkspace.openSession(sessionId) },
        startSession: (workspaceId?: string) => { scope.uiWorkspace.startSession(workspaceId) },
        renameSession: (sessionId: string, title: string) => scope.sessions.rename(sessionId, title),
        forkSession: (sessionId: string) => scope.uiWorkspace.forkSession(sessionId),
        pinSession: (sessionId: string) => scope.uiWorkspace.pinSession(sessionId),
        unpinSession: (sessionId: string) => scope.uiWorkspace.unpinSession(sessionId),
        archiveSession: (sessionId: string) => scope.workspaces.archiveSession(sessionId),
        archiveSessionStop: (sessionId: string) => scope.workspaces.archiveSession(sessionId, { stopActivity: true }),
        unarchiveSession: (sessionId: string) => scope.workspaces.unarchiveSession(sessionId),
      },
      ws: {
        create: (path: string) => scope.workspaces.create({ path }),
        rename: (workspaceId: string, title: string) => scope.workspaces.rename(workspaceId, title),
        remove: (workspaceId: string) => scope.workspaces.delete(workspaceId),
        pickDirectory: () => scope.uiWorkspace.pickDirectory(),
      },
    }

    if (sidebarMode() === 'grouped') {
      // Shadow the official WorkspaceBrowser: lower priority wins the single
      // slot; the official entry stays live, so disposing this registration
      // (mode switch / plugin disable) restores it verbatim.
      slots.inject('sidebar.workspaces', () => slots.register(
        {
          name: 'sidebar.workspaces',
          priority: -1,
          locale: NS,
          inject: () => ({ wsg }),
        },
        GroupedRegion,
      ))
    } else {
      // Official view: park a switch-back affordance at the sidebar foot.
      slots.inject('sidebar.footer.action', () => slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'workspace-groups-official-toggle',
          order: 50,
          locale: NS,
          label: () => t('useGroupedView'),
        },
        OfficialModeSentinel,
      ))
    }
  })
}
