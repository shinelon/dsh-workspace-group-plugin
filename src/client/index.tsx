/**
 * Workspace-group surface plugin, browser half. Registers the 「分组」 main
 * panel (`main` keyed slot + `sidebar.panellist` icon row — the same shape as
 * the shipped schedule/plugin-manager panels) once the layout shell declares
 * those slots. Navigation verbs come from the uiWorkspace service; management
 * verbs call this package's host /workspace-group-manager routes.
 * @module dsh-workspace-group-manager/client
 */

import { groupsApi } from './api'
import { GroupPanel, PanelIcon } from './panel'
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

/**
 * Client plugin body: dictionaries, then the panel registrations with the
 * injected navigation face. Slot declarations come from ui-layout/ui-sidebar
 * and the uiWorkspace service from ui-workspace — activation order is not
 * constrained, so every wait is declaration/service aware.
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

  ctx.inject(['slots', 'uiWorkspace'], (scope: {
    slots: SlotRegistry
    uiWorkspace: {
      openSession(target: unknown): void
      startSession(workspaceId?: unknown): void
    }
  }) => {
    const slots = scope.slots
    const wsg = {
      api: groupsApi,
      nav: {
        openSession: (sessionId: string) => { scope.uiWorkspace.openSession(sessionId) },
        startSession: (workspaceId?: string) => { scope.uiWorkspace.startSession(workspaceId) },
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
  })
}
