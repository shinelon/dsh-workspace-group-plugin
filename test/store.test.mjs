// Store tests: round-trip over a temp file, validation, dedupe, corrupt-file
// recovery, and cross-instance persistence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGroupsStore, loadGroupsFile, normalizePaths, normalizeTitle } from '../src/host/store.js'

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-store-'))
  const filePath = join(dir, 'workspace-groups.json')
  return { store: await createGroupsStore({ filePath }), filePath, dir }
}

test('normalizeTitle trims and rejects empty/overlong', () => {
  assert.equal(normalizeTitle('  dsh 插件  '), 'dsh 插件')
  assert.equal(normalizeTitle('   '), null)
  assert.equal(normalizeTitle('x'.repeat(101)), null)
  assert.equal(normalizeTitle(42), null)
})

test('normalizePaths dedupes and rejects bad entries', () => {
  assert.deepEqual(normalizePaths(['D:\\a', ' D:\\a ', 'D:\\b']), ['D:\\a', 'D:\\b'])
  assert.equal(normalizePaths(['']), null)
  assert.equal(normalizePaths([1]), null)
  assert.equal(normalizePaths('D:\\a'), null)
})

test('create persists a group and survives a fresh store instance', async () => {
  const { store, filePath } = await tempStore()
  const group = await store.create(' 公司项目 ')
  assert.equal(group.title, '公司项目')
  assert.deepEqual(store.snapshot().groups.map(g => g.title), ['公司项目'])

  const onDisk = JSON.parse(await readFile(filePath, 'utf8'))
  assert.equal(onDisk.version, 1)
  assert.deepEqual(onDisk.groups.map(g => g.id), [group.id])

  const reloaded = await createGroupsStore({ filePath })
  assert.deepEqual(reloaded.snapshot().groups.map(g => g.id), [group.id])
})

test('membership add is idempotent; removeMember drops exactly one path', async () => {
  const { store } = await tempStore()
  const g = await store.create('g')
  await store.addMembers(g.id, ['D:\\a', 'D:\\b'])
  const again = await store.addMembers(g.id, ['D:\\b', 'D:\\c'])
  assert.deepEqual(again.paths, ['D:\\a', 'D:\\b', 'D:\\c'])
  const after = await store.removeMember(g.id, 'D:\\b')
  assert.deepEqual(after.paths, ['D:\\a', 'D:\\c'])
  // Removing a non-member is an idempotent no-op; only a missing group rejects.
  const still = await store.removeMember(g.id, 'D:\\nope')
  assert.deepEqual(still.paths, ['D:\\a', 'D:\\c'])
})

test('rename and remove target by id; missing ids throw not-found', async () => {
  const { store } = await tempStore()
  const g = await store.create('old')
  const renamed = await store.rename(g.id, 'new')
  assert.equal(renamed.title, 'new')
  assert.equal(await store.remove(g.id), true)
  assert.deepEqual(store.snapshot().groups, [])
  await assert.rejects(store.rename(g.id, 'x'), /not-found|not found/i)
  await assert.rejects(store.remove(g.id), /not-found|not found/i)
  await assert.rejects(store.addMembers(g.id, ['D:\\a']), /not-found|not found/i)
})

test('invalid payloads throw code=invalid', async () => {
  const { store } = await tempStore()
  await assert.rejects(store.create('   '), error => error.code === 'invalid')
  const g = await store.create('g')
  await assert.rejects(store.addMembers(g.id, []), error => error.code === 'invalid')
  await assert.rejects(store.addMembers(g.id, ['']), error => error.code === 'invalid')
})

test('corrupt file is backed up and store starts empty with a notice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-store-'))
  const filePath = join(dir, 'workspace-groups.json')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, '{ not json', 'utf8')
  const loaded = await loadGroupsFile(filePath)
  assert.equal(loaded.doc.groups.length, 0)
  // The notice names the backup file the corrupt original was moved to.
  assert.ok(loaded.notice !== null && loaded.notice.startsWith(filePath) && loaded.notice.includes('.bak-'))
  const backupName = (await readdir(dir)).find(name => name.startsWith('workspace-groups.json.bak-'))
  assert.ok(backupName, 'backup file exists')
  assert.equal(await readFile(join(dir, /** @type {string} */ (backupName)), 'utf8'), '{ not json')
})

test('structurally-invalid documents (bad group shape) count as corrupt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wsg-store-'))
  const filePath = join(dir, 'workspace-groups.json')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, JSON.stringify({ version: 1, groups: [{ id: '', title: 'x', paths: [] }] }), 'utf8')
  const loaded = await loadGroupsFile(filePath)
  assert.equal(loaded.doc.groups.length, 0)
  assert.ok(loaded.notice)
})

test('concurrent mutations serialize and all land', async () => {
  const { store } = await tempStore()
  const g = await store.create('g')
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.addMembers(g.id, [`D:\\p${i}`])))
  assert.equal(store.snapshot().groups[0]?.paths.length, 20)
})
