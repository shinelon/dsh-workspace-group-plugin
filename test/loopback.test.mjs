// Loopback fence unit tests over synthetic request objects.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIPv4Loopback, isLoopbackAddress, isLoopbackHostname, isLoopbackRequest } from '../src/host/loopback.js'

/** @param {string} remoteAddress @param {Record<string, string>} headers */
function fakeRequest(remoteAddress, headers) {
  return /** @type {any} */ ({ socket: { remoteAddress }, headers })
}

test('IPv4 loopback predicate', () => {
  assert.equal(isIPv4Loopback('127.0.0.1'), true)
  assert.equal(isIPv4Loopback('127.255.1.2'), true)
  assert.equal(isIPv4Loopback('128.0.0.1'), false)
  assert.equal(isIPv4Loopback('127.1'), false)
  assert.equal(isIPv4Loopback('a.b.c.d'), false)
})

test('socket address predicate covers 127/8, ::1, IPv4-mapped', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('192.168.1.5'), false)
  assert.equal(isLoopbackAddress('::ffff:192.168.1.5'), false)
  assert.equal(isLoopbackAddress(undefined), false)
})

test('hostname predicate', () => {
  assert.equal(isLoopbackHostname('localhost'), true)
  assert.equal(isLoopbackHostname('[::1]'), true)
  assert.equal(isLoopbackHostname('127.0.0.1'), true)
  assert.equal(isLoopbackHostname('example.com'), false)
})

test('isLoopbackRequest requires loopback socket AND Host, then same-origin markers', () => {
  const ok = fakeRequest('127.0.0.1', { host: 'localhost:1234' })
  assert.equal(isLoopbackRequest(ok), true)

  // Remote socket: rejected regardless of headers.
  assert.equal(isLoopbackRequest(fakeRequest('10.0.0.9', { host: 'localhost:1234' })), false)

  // Loopback socket but foreign Host.
  assert.equal(isLoopbackRequest(fakeRequest('127.0.0.1', { host: 'evil.example.com' })), false)

  // Cross-site fetch marker.
  assert.equal(isLoopbackRequest(fakeRequest('127.0.0.1', {
    host: 'localhost:1234',
    'sec-fetch-site': 'cross-site',
  })), false)

  // Same-origin marker passes.
  assert.equal(isLoopbackRequest(fakeRequest('127.0.0.1', {
    host: 'localhost:1234',
    'sec-fetch-site': 'same-origin',
    origin: 'http://localhost:1234',
  })), true)

  // Origin mismatch.
  assert.equal(isLoopbackRequest(fakeRequest('127.0.0.1', {
    host: 'localhost:1234',
    origin: 'http://localhost:9999',
  })), false)
})
