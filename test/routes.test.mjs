// Route integration tests: register against a fake webServer, drive the
// captured handler with synthetic req/res, assert envelope outcomes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGroupsStore } from '../src/host/store.js'
import { registerRoutes } from '../src/host/routes.js'

/**
 * @param {Record<string, unknown> | undefined} body
 * @param {{ method?: string, url?: string, remoteAddress?: string, host?: string }} [options]
 */
function fakeReq(body, options = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  return /** @type {any} */ ({
    method: options.method ?? 'POST',
    url: options.url ?? '/workspace-group-manager/list',
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    headers: { host: options.host ?? 'localhost:56476' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  })
}

function fakeRes() {
  /** @type {{ status?: number, body?: any }} */
  const captured = {}
  return {
    captured,
    /** @type {any} */
    res: {
      writeHead(status, _headers) {
        captured.status = status
      },
      end(payload) {
        captured.body = JSON.parse(String(payload))
      },
    },
  }
}

/** @param {{ createStore?: typeof createGroupsStore }} [options] */
function setup(options = {}) {
  /** @type {any} */
  const registered = {}
  const ctx = {
    webServer: {
      /** @param {any} spec */
      register(spec) {
        Object.assign(registered, spec)
        return () => {}
      },
    },
  }
  const dispose = registerRoutes(/** @type {any} */ (ctx), options)
  return { handler: registered.handler, dispose }
}

async function call(handler, req) {
  const { captured, res } = fakeRes()
  await handler(req, res)
  return captured
}

test('full lifecycle over the routes: create → list → add-members → rename → remove-member → delete', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-routes-'))
  const filePath = join(dir, 'workspace-groups.json')
  const { handler } = setup({ createStore: () => createGroupsStore({ filePath }) })

  const created = await call(handler, fakeReq({ title: ' 公司项目 ' }, { url: '/workspace-group-manager/create' }))
  assert.equal(created.status, 200)
  assert.equal(created.body.ok, true)
  const group = created.body.value.group
  assert.equal(group.title, '公司项目')

  const listed = await call(handler, fakeReq({}, { url: '/workspace-group-manager/list' }))
  assert.deepEqual(listed.body.value.groups.map((/** @type {any} */ g) => g.id), [group.id])
  assert.equal(listed.body.value.notice, null)

  const added = await call(handler, fakeReq(
    { id: group.id, paths: ['D:\\a', 'D:\\a', 'D:\\b'] },
    { url: '/workspace-group-manager/add-members' },
  ))
  assert.deepEqual(added.body.value.group.paths, ['D:\\a', 'D:\\b'])

  const renamed = await call(handler, fakeReq({ id: group.id, title: '新名' }, { url: '/workspace-group-manager/rename' }))
  assert.equal(renamed.body.value.group.title, '新名')

  const removedMember = await call(handler, fakeReq(
    { id: group.id, path: 'D:\\a' },
    { url: '/workspace-group-manager/remove-member' },
  ))
  assert.deepEqual(removedMember.body.value.group.paths, ['D:\\b'])

  const removed = await call(handler, fakeReq({ id: group.id }, { url: '/workspace-group-manager/delete' }))
  assert.equal(removed.body.value.removed, true)

  const empty = await call(handler, fakeReq({}, { url: '/workspace-group-manager/list' }))
  assert.deepEqual(empty.body.value.groups, [])
})

test('unknown route, missing fields, and unknown ids produce typed errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-routes-'))
  const { handler } = setup({ createStore: () => createGroupsStore({ filePath: join(dir, 'g.json') }) })

  const unknown = await call(handler, fakeReq({}, { url: '/workspace-group-manager/nope' }))
  assert.equal(unknown.body.ok, false)
  assert.equal(unknown.body.error.code, 'not-found')

  const missingTitle = await call(handler, fakeReq({}, { url: '/workspace-group-manager/create' }))
  assert.equal(missingTitle.body.error.code, 'invalid')

  const missingPaths = await call(handler, fakeReq({ id: 'x' }, { url: '/workspace-group-manager/add-members' }))
  assert.equal(missingPaths.body.error.code, 'invalid')

  const unknownId = await call(handler, fakeReq({ id: 'nope', title: 'x' }, { url: '/workspace-group-manager/rename' }))
  assert.equal(unknownId.status, 404)
  assert.equal(unknownId.body.error.code, 'not-found')
})

test('non-POST gets 405; non-loopback gets 403 before any body handling', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-routes-'))
  const { handler } = setup({ createStore: () => createGroupsStore({ filePath: join(dir, 'g.json') }) })

  const get = await call(handler, fakeReq(undefined, { method: 'GET' }))
  assert.equal(get.status, 405)

  const remote = await call(handler, fakeReq({ title: 'x' }, { url: '/workspace-group-manager/create', remoteAddress: '10.1.2.3' }))
  assert.equal(remote.status, 403)
  assert.equal(remote.body.error.code, 'forbidden')
})

test('reorder routes persist member and group order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-routes-'))
  const { handler } = setup({ createStore: () => createGroupsStore({ filePath: join(dir, 'g.json') }) })

  const g1 = (await call(handler, fakeReq({ title: 'one' }, { url: '/workspace-group-manager/create' }))).body.value.group
  const g2 = (await call(handler, fakeReq({ title: 'two' }, { url: '/workspace-group-manager/create' }))).body.value.group
  await call(handler, fakeReq({ id: g1.id, paths: ['D:\\a', 'D:\\b'] }, { url: '/workspace-group-manager/add-members' }))

  const reordered = await call(handler, fakeReq(
    { id: g1.id, paths: ['D:\\b', 'D:\\a'] },
    { url: '/workspace-group-manager/reorder-members' },
  ))
  assert.deepEqual(reordered.body.value.group.paths, ['D:\\b', 'D:\\a'])

  await call(handler, fakeReq({ ids: [g2.id, g1.id] }, { url: '/workspace-group-manager/reorder-groups' }))
  const listed = await call(handler, fakeReq({}, { url: '/workspace-group-manager/list' }))
  assert.deepEqual(listed.body.value.groups.map((/** @type {any} */ g) => g.id), [g2.id, g1.id])

  const bad = await call(handler, fakeReq({ ids: [g1.id] }, { url: '/workspace-group-manager/reorder-groups' }))
  assert.equal(bad.body.error.code, 'invalid')
})

test('malformed body is treated as null (invalid instead of crash)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-routes-'))
  const { handler } = setup({ createStore: () => createGroupsStore({ filePath: join(dir, 'g.json') }) })
  const req = fakeReq(undefined, { url: '/workspace-group-manager/create' })
  req[Symbol.asyncIterator] = async function * () { yield Buffer.from('not-json', 'utf8') }
  const captured = await call(handler, req)
  assert.equal(captured.body.ok, false)
  assert.equal(captured.body.error.code, 'invalid')
})
