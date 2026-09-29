/**
 * Workspace-group plugin, browser half. The grouped sidebar region: while
 * `wsg.sidebarMode` is not 'official', shadows the official WorkspaceBrowser
 * under `sidebar.workspaces` at priority -1; otherwise the official browser
 * renders untouched. The view mode is switched from the plugin's settings
 * section (「工作区视图」) and applies LIVE — the sidebar registration is
 * disposed and re-created on change, no reload. Group and directory
 * management lives in the region itself.
 * @module dsh-workspace-group-manager/client
 */

import { groupsApi } from './api'
import { GroupedRegion } from './region'
import { ViewModeSection, type SidebarMode } from './settings-section'
import { NS, zh, en } from './locales'

/** The locale namespace owned by this plugin. */
export const NS_WSG = NS

/** localStorage key deciding which sidebar region renders. */
export const MODE_KEY = 'wsg.sidebarMode'

/** DOM event dispatched after the persisted mode changes (drives live swap). */
const MODE_EVENT = 'wsg.sidebarMode.change'

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

function sidebarMode(): SidebarMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'official' ? 'official' : 'grouped'
  } catch {
    return 'grouped'
  }
}

function persistMode(mode: SidebarMode): void {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* browser-local only */ }
  window.dispatchEvent(new Event(MODE_EVENT))
}

/**
 * Client plugin body: dictionaries, then the sidebar registration (live
 * mode swap) and the settings section with the injected navigation/mutation
 * face. Slot declarations come from ui-layout/ui-sidebar/ui-settings and the
 * services (uiWorkspace, workspaces model) from their owners — activation
 * order is not constrained, so every wait is declaration/service aware.
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
    effect(fn: () => (() => void) | void, label: string): void
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
      /** 0.2.0-rc.1: session rename runs through a retained reference. */
      using<T>(target: unknown, options: { source: string }, operation: (reference: {
        binding: { session: { rename(title: string): Promise<unknown> } }
      }) => unknown): Promise<unknown>
      search(query: string, signal: AbortSignal): Promise<
        { ok: true; value: { items: Array<{ sessionId: string; snippet: string }>; hasMore: boolean } }
        | { ok: false; error: { message: string } }
      >
    }
  }) => {
    const slots = scope.slots
    const wsg = {
      api: groupsApi,
      nav: {
        openSession: (sessionId: string) => { scope.uiWorkspace.openSession(sessionId) },
        startSession: (workspaceId?: string) => { scope.uiWorkspace.startSession(workspaceId) },
        renameSession: (sessionId: string, title: string) => scope.sessions
          .using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title)),
        search: async (query: string, signal: AbortSignal) => {
          const result = await scope.sessions.search(query, signal)
          if (!result.ok) throw new Error(result.error.message)
          return result.value
        },
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

    // Sidebar region per mode; `applySidebarMode` disposes and re-creates it
    // when the settings section flips the mode (live, no reload).
    let disposeSidebar: (() => void) | null = null
    const applySidebarMode = () => {
      if (disposeSidebar !== null) { disposeSidebar(); disposeSidebar = null }
      if (sidebarMode() !== 'grouped') return
      // Shadow the official WorkspaceBrowser: lower priority wins the single
      // slot; the official entry stays live, so disposing this registration
      // restores it verbatim.
      slots.inject('sidebar.workspaces', () => {
        const dispose = slots.register(
          {
            name: 'sidebar.workspaces',
            priority: -1,
            locale: NS,
            inject: () => ({ wsg }),
          },
          GroupedRegion,
        )
        disposeSidebar = () => { dispose(); disposeSidebar = null }
        return dispose
      })
    }
    applySidebarMode()

    // Live mode swap: the settings section dispatches; re-create the sidebar
    // registration for the new mode. The listener lives with this fiber.
    scope.effect(() => {
      const handler = () => applySidebarMode()
      window.addEventListener(MODE_EVENT, handler)
      return () => { window.removeEventListener(MODE_EVENT, handler) }
    }, 'workspace-group-manager: mode-change listener')

    // Settings section: 分组视图 / 官方视图 cards (order after MCP 服务).
    slots.inject('settings.section', () => slots.register(
      {
        name: 'settings.section',
        id: 'workspace-view',
        order: 65,
        locale: NS,
        label: () => t('settingsNav'),
        inject: () => ({
          // Read live: inject faces freeze at first render, so the CURRENT
          // mode must be a getter, not a captured value.
          mode: sidebarMode,
          onChange: persistMode,
        }),
      },
      ViewModeSection,
    ))
  })
}
