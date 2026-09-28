// Groups JSON store for the workspace-group-manager host half: tolerant load,
// queued read-modify-write cycles, atomic temp+rename persistence.
//
// File layout: <dsh home>/workspace-groups.json, resolved through
// @deepseek-ai/dsh-home-paths so the store agrees with the harness data root
// (explicit config > $DSH_HOME > ~/.dsh). A test may inject the file path
// directly via createGroupsStore({ filePath }).
//
// Schema:
// {
//   "version": 1,
//   "groups": [{ "id", "title", "paths": string[], "createdAt", "updatedAt" }]
// }
//
// A corrupt file is renamed to workspace-groups.json.bak-<timestamp> and the
// store starts empty; the load report carries a notice so surfaces can tell
// the user what happened.

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** @typedef {{ id: string, title: string, paths: string[], createdAt: string, updatedAt: string }} Group */
/** @typedef {{ version: number, groups: Group[] }} GroupsDocument */

const SCHEMA_VERSION = 1
const MAX_GROUPS = 100
const MAX_MEMBERS_PER_GROUP = 200
const TITLE_MAX = 100
const PATH_MAX = 1024

/** @returns {string} */
function defaultFilePath() {
  return join(resolveDshHome(), 'workspace-groups.json')
}

/**
 * @param {string} raw
 * @returns {string | null} trimmed title, or null when invalid
 */
export function normalizeTitle(raw) {
  if (typeof raw !== 'string') return null
  const title = raw.trim()
  if (title === '' || title.length > TITLE_MAX) return null
  return title
}

/**
 * @param {unknown} raw
 * @returns {string[] | null} deduped path list, or null when invalid
 */
export function normalizePaths(raw) {
  if (!Array.isArray(raw)) return null
  /** @type {string[]} */
  const paths = []
  for (const item of raw) {
    if (typeof item !== 'string') return null
    const p = item.trim()
    if (p === '' || p.length > PATH_MAX) return null
    if (!paths.includes(p)) paths.push(p)
  }
  return paths
}

/**
 * @param {string} raw
 * @returns {{ doc: GroupsDocument } | { corrupt: true }}
 */
function parseDocument(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { corrupt: true }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { corrupt: true }
  const record = /** @type {Record<string, unknown>} */ (parsed)
  const groupsRaw = record.groups
  if (!Array.isArray(groupsRaw)) return { corrupt: true }
  /** @type {Group[]} */
  const groups = []
  const seenIds = new Set()
  for (const item of groupsRaw) {
    if (typeof item !== 'object' || item === null) return { corrupt: true }
    const g = /** @type {Record<string, unknown>} */ (item)
    const id = typeof g.id === 'string' && g.id !== '' ? g.id : null
    const title = normalizeTitle(g.title)
    const paths = normalizePaths(g.paths)
    if (id === null || title === null || paths === null || seenIds.has(id)) return { corrupt: true }
    seenIds.add(id)
    groups.push({
      id,
      title,
      paths: paths.slice(0, MAX_MEMBERS_PER_GROUP),
      createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
      updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : new Date().toISOString(),
    })
  }
  return { doc: { version: SCHEMA_VERSION, groups: groups.slice(0, MAX_GROUPS) } }
}

/**
 * @param {string} filePath
 * @returns {Promise<{ doc: GroupsDocument, notice: string | null }>}
 */
export async function loadGroupsFile(filePath) {
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return { doc: { version: SCHEMA_VERSION, groups: [] }, notice: null }
    throw error
  }
  const parsed = parseDocument(raw)
  if ('doc' in parsed) return { doc: parsed.doc, notice: null }
  const backup = `${filePath}.bak-${Date.now()}`
  await rename(filePath, backup).catch(() => {})
  return { doc: { version: SCHEMA_VERSION, groups: [] }, notice: backup }
}

/**
 * @param {GroupsDocument} doc
 * @param {string} filePath
 */
export async function saveGroupsFile(doc, filePath) {
  await mkdir(dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  await rename(temp, filePath)
}

/**
 * Create the groups store. All mutations run inside one in-process queue, so
 * read-modify-write cycles never interleave; concurrent callers observe
 * last-write-wins per operation.
 * @param {{ filePath?: string }} [options]
 */
export async function createGroupsStore(options = {}) {
  const filePath = options.filePath ?? defaultFilePath()
  const loaded = await loadGroupsFile(filePath)
  /** @type {GroupsDocument} */
  let doc = loaded.doc

  /** @type {Promise<unknown>} */
  let queue = Promise.resolve()
  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  const exclusive = (fn) => {
    const run = queue.then(fn, fn)
    queue = run.catch(() => {})
    return run
  }

  /**
   * @param {(doc: GroupsDocument) => GroupsDocument} mutateDoc
   * @returns {Promise<void>}
   */
  const mutate = (mutateDoc) => exclusive(async () => {
    doc = mutateDoc(doc)
    await saveGroupsFile(doc, filePath)
  })

  /** @param {string} id @returns {Group} */
  const mustFind = (id) => {
    const group = doc.groups.find(g => g.id === id)
    if (group === undefined) throw Object.assign(new Error('group not found'), { code: 'not-found' })
    return group
  }

  return {
    filePath,
    loadNotice: loaded.notice,
    /** @returns {GroupsDocument} */
    snapshot: () => doc,
    /**
     * @param {string} title
     * @returns {Promise<Group>}
     */
    async create(title) {
      const clean = normalizeTitle(title)
      if (clean === null) throw Object.assign(new Error('invalid title'), { code: 'invalid' })
      if (doc.groups.length >= MAX_GROUPS) throw Object.assign(new Error('too many groups'), { code: 'conflict' })
      const now = new Date().toISOString()
      const group = { id: randomUUID(), title: clean, paths: [], createdAt: now, updatedAt: now }
      await mutate(current => ({ ...current, groups: [...current.groups, group] }))
      return group
    },
    /**
     * @param {string} id
     * @param {string} title
     * @returns {Promise<Group>}
     */
    async rename(id, title) {
      const clean = normalizeTitle(title)
      if (clean === null) throw Object.assign(new Error('invalid title'), { code: 'invalid' })
      await mutate((current) => {
        if (!current.groups.some(g => g.id === id)) throw Object.assign(new Error('group not found'), { code: 'not-found' })
        return {
          ...current,
          groups: current.groups.map(g => g.id === id ? { ...g, title: clean, updatedAt: new Date().toISOString() } : g),
        }
      })
      return mustFind(id)
    },
    /**
     * @param {string} id
     * @returns {Promise<true>}
     */
    async remove(id) {
      await mutate((current) => {
        const groups = current.groups.filter(g => g.id !== id)
        if (groups.length === current.groups.length) throw Object.assign(new Error('group not found'), { code: 'not-found' })
        return { ...current, groups }
      })
      return true
    },
    /**
     * @param {string} id
     * @param {string[]} rawPaths
     * @returns {Promise<Group>}
     */
    async addMembers(id, rawPaths) {
      const paths = normalizePaths(rawPaths)
      if (paths === null || paths.length === 0) throw Object.assign(new Error('invalid paths'), { code: 'invalid' })
      await mutate((current) => {
        const group = current.groups.find(g => g.id === id)
        if (group === undefined) throw Object.assign(new Error('group not found'), { code: 'not-found' })
        const merged = [...group.paths]
        for (const p of paths) if (!merged.includes(p)) merged.push(p)
        if (merged.length > MAX_MEMBERS_PER_GROUP) throw Object.assign(new Error('too many members'), { code: 'conflict' })
        return {
          ...current,
          groups: current.groups.map(g => g.id === id ? { ...g, paths: merged, updatedAt: new Date().toISOString() } : g),
        }
      })
      return mustFind(id)
    },
    /**
     * @param {string} id
     * @param {string} path
     * @returns {Promise<Group>}
     */
    async removeMember(id, path) {
      if (typeof path !== 'string' || path.trim() === '') throw Object.assign(new Error('invalid path'), { code: 'invalid' })
      await mutate((current) => {
        const group = current.groups.find(g => g.id === id)
        if (group === undefined) throw Object.assign(new Error('group not found'), { code: 'not-found' })
        return {
          ...current,
          groups: current.groups.map(g => g.id === id
            ? { ...g, paths: g.paths.filter(p => p !== path), updatedAt: new Date().toISOString() }
            : g),
        }
      })
      return mustFind(id)
    },
  }
}
