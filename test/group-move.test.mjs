// Move-matrix tests for the groups panel drag & drop (pure TS via strip-types).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeGroupMove, isDropTarget } from '../src/client/group-move.ts'

const fromA = { path: 'D:\\a', fromGroupId: 'A' }
const fromUngrouped = { path: 'D:\\a', fromGroupId: null }

test('group → other group: remove from source then add to target', () => {
  assert.deepEqual(computeGroupMove(fromA, 'B'), {
    remove: { groupId: 'A', path: 'D:\\a' },
    add: { groupId: 'B', path: 'D:\\a' },
    targetGroupId: 'B',
  })
})

test('group → same group is a no-op', () => {
  assert.equal(computeGroupMove(fromA, 'A'), null)
  assert.equal(isDropTarget(fromA, 'A'), false)
})

test('group → ungrouped: remove only', () => {
  assert.deepEqual(computeGroupMove(fromA, null), {
    remove: { groupId: 'A', path: 'D:\\a' },
    targetGroupId: null,
  })
})

test('ungrouped → group: add only', () => {
  assert.deepEqual(computeGroupMove(fromUngrouped, 'B'), {
    add: { groupId: 'B', path: 'D:\\a' },
    targetGroupId: 'B',
  })
})

test('ungrouped → ungrouped is a no-op', () => {
  assert.equal(computeGroupMove(fromUngrouped, null), null)
  assert.equal(isDropTarget(fromUngrouped, null), false)
})

test('no active drag: nothing is a drop target', () => {
  assert.equal(computeGroupMove(null, 'B'), null)
  assert.equal(isDropTarget(null, null), false)
  assert.equal(isDropTarget(null, 'B'), false)
})

test('drop-target predicate matches the move matrix', () => {
  assert.equal(isDropTarget(fromA, 'B'), true)
  assert.equal(isDropTarget(fromA, null), true)
  assert.equal(isDropTarget(fromUngrouped, 'B'), true)
})
