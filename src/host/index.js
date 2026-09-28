/**
 * @local/workspace-group-manager — host half: registers the
 * /workspace-group-manager/* HTTP routes (list / create / rename / delete /
 * add-members / remove-member over the groups JSON store) on the shared
 * webserver. The browser half (exports "./client") adds the "分组" main panel
 * to the web GUI.
 *
 * Write safety: the loopback trust fence in front of every request, and the
 * store's in-process queue serializing read-modify-write cycles with atomic
 * temp+rename persistence (see store.js).
 *
 * @module @local/workspace-group-manager
 */

import { registerRoutes } from './routes.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'workspace-group-manager'

/** Services required by this plugin. */
export const inject = ['webServer']

/**
 * Mount the route family for this plugin instance's lifetime.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => registerRoutes(ctx), 'workspace-group-manager: /workspace-group-manager routes')
}
