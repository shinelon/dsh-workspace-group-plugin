// /workspace-group-manager/* route layer for the host half: a JSON envelope
// (`{ ok, value } | { ok, error }`) over the groups JSON store. Loopback-only
// (the trust fence runs before any method or body handling). Group mutations
// serialize inside the store's in-process queue.
//
// @module @local/workspace-group-manager/host/routes

import { createGroupsStore } from './store.js'
import { isLoopbackRequest } from './loopback.js'

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' }
const BODY_MAX_BYTES = 64 * 1024

/**
 * @param {ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function writeJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function httpError(code, message) {
  return /** @type {Error & { code: string }} */ (Object.assign(new Error(message), { code }))
}

/**
 * Read one bounded JSON object body, or null on any malformation.
 * @param {IncomingMessage} req
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function readJsonObjectBody(req) {
  /** @type {Buffer[]} */
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = /** @type {Buffer} */ (chunk)
    size += buffer.length
    if (size > BODY_MAX_BYTES) {
      req.destroy()
      return null
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return /** @type {Record<string, unknown>} */ (parsed)
  } catch {
    return null
  }
}

/**
 * Require a non-empty string field.
 * @param {Record<string, unknown> | null} body
 * @param {string} field
 * @returns {string}
 */
function requireString(body, field) {
  const value = body?.[field]
  if (typeof value !== 'string' || value.trim() === '') throw httpError('invalid', `缺少 ${field}`)
  return value
}

/**
 * Dispatch one route by its path suffix.
 * @param {Awaited<ReturnType<typeof createGroupsStore>>} store
 * @param {string} route
 * @param {Record<string, unknown> | null} body
 */
async function dispatch(store, route, body) {
  switch (route) {
    case 'list': {
      const doc = store.snapshot()
      return { groups: doc.groups, notice: store.loadNotice }
    }
    case 'create':
      return { group: await store.create(requireString(body, 'title')) }
    case 'rename':
      return { group: await store.rename(requireString(body, 'id'), requireString(body, 'title')) }
    case 'delete':
      return { removed: await store.remove(requireString(body, 'id')) }
    case 'add-members': {
      const paths = body?.paths
      if (!Array.isArray(paths) || paths.length === 0) throw httpError('invalid', '缺少 paths')
      return { group: await store.addMembers(requireString(body, 'id'), /** @type {string[]} */ (paths)) }
    }
    case 'remove-member':
      return { group: await store.removeMember(requireString(body, 'id'), requireString(body, 'path')) }
    case 'reorder-members': {
      const paths = body?.paths
      if (!Array.isArray(paths) || paths.length === 0) throw httpError('invalid', '缺少 paths')
      return { group: await store.reorderMembers(requireString(body, 'id'), /** @type {string[]} */ (paths)) }
    }
    case 'reorder-groups': {
      const ids = body?.ids
      if (!Array.isArray(ids) || ids.length === 0) throw httpError('invalid', '缺少 ids')
      return { ordered: await store.reorderGroups(/** @type {string[]} */ (ids)) }
    }
    default:
      throw httpError('not-found', `未知路由 "${route}"`)
  }
}

/**
 * Register the /workspace-group-manager routes on the shared webserver.
 * The store initializes lazily (first request awaits readiness), so a slow
 * disk can never block plugin activation.
 * @param {import('@deepseek-ai/cordis').Context} ctx Context carrying webServer.
 * @param {{ createStore?: typeof createGroupsStore }} [options] test seam.
 * @returns {() => void} Route disposer.
 */
export function registerRoutes(ctx, options = {}) {
  const createStore = options.createStore ?? createGroupsStore
  const storePromise = createStore()

  const handler = async (/** @type {IncomingMessage} */ req, /** @type {ServerResponse} */ res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden: loopback-only' } })
      return
    }
    let route = ''
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      route = url.pathname.replace(/^\/workspace-group-manager\/?/, '').replace(/\/$/, '')
    } catch {
      route = ''
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'invalid', message: '仅支持 POST' } })
      return
    }
    const body = await readJsonObjectBody(req)
    try {
      const store = await storePromise
      const value = await dispatch(store, route, body)
      writeJson(res, 200, { ok: true, value })
    } catch (error) {
      const code = /** @type {string} */ (/** @type {any} */ (error)?.code ?? 'internal')
      const status = code === 'not-found' ? 404 : code === 'forbidden' ? 403 : 200
      writeJson(res, status, { ok: false, error: { code, message: String(/** @type {any} */ (error)?.message ?? error) } })
    }
  }
  return ctx.webServer.register({ kind: 'prefix', path: '/workspace-group-manager', handler })
}
