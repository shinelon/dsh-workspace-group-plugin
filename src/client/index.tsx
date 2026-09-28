/**
 * Workspace-group surface plugin, browser half. Two capabilities:
 *
 * 1. The 「分组」 main panel (`main` keyed slot + `sidebar.panellist` icon
 *    row) — always registered.
 * 2. The grouped sidebar region (Phase 0+): while `wsg.sidebarMode` is not
 *    'official', shadows the official WorkspaceBrowser under
 *    `sidebar.workspaces` at priority -1; otherwise registers a small
 *    `sidebar.footer.action` sentinel that switches back. The mode flag is
 *    read at apply time; switching reloads the page.
 * @module dsh-workspace-group-manager/client
 */

import { groupsApi } from './api'
import { GroupPanel, PanelIcon } from './panel'
import { GroupedRegion, MODE_KEY, OfficialModeSentinel } from './region'
import { NS, zh, en } from './locales'

/** The locale namespace owned by this plugin. */
export const NS_WSG = NS

/** Main panel id: the panellist row id and the keyed main slot key. */
export const PANEL_ID = 'workspace-groups'

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
 * Client plugin body: dictionaries, then the panel + region registrations
 * with the injected navigation/mutation face. Slot declarations come from
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

  ctx.inject(['slots', 'uiWorkspace', 'workspaces'], (scope: {
    slots: SlotRegistry
    uiWorkspace: {
      openSession(target: unknown): void
      startSession(workspaceId?: unknown): void
      pickDirectory(): Promise<string | null>
    }
    workspaces: {
      create(input: { path: string }): Promise<unknown>
      rename(workspaceId: string, title: string): Promise<unknown>
      delete(workspaceId: string): Promise<unknown>
    }
  }) => {
    const slots = scope.slots
    const wsg = {
      api: groupsApi,
      nav: {
        openSession: (sessionId: string) => { scope.uiWorkspace.openSession(sessionId) },
        startSession: (workspaceId?: string) => { scope.uiWorkspace.startSession(workspaceId) },
      },
      ws: {
        create: (path: string) => scope.workspaces.create({ path }),
        rename: (workspaceId: string, title: string) => scope.workspaces.rename(workspaceId, title),
        remove: (workspaceId: string) => scope.workspaces.delete(workspaceId),
        pickDirectory: () => scope.uiWorkspace.pickDirectory(),
      },
    }

    // The panel page: keyed under PANEL_ID in the layout's main slot.
    slots.inject('main', () => slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ wsg }),
      },
      GroupPanel,
    ))

    // The sidebar rail row: same id, so the shell opens the keyed panel.
    slots.inject('sidebar.panellist', () => slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: () => t('panel'),
      },
      PanelIcon,
    ))

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
