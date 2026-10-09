import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

// A separate baseline tree lets the same contracts prove RED without mutating it.
const require = createRequire(resolve(process.env.HERMES_TEST_DEPENDENCY_ROOT || import.meta.dirname, 'package.json'))

test('shell quoting rejects line terminators after a comment token', () => {
  const { quote, parse } = require('shell-quote')
  for (const line of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote([{ comment: 'fixture' }, `text${line}more`]), TypeError)
  }
  assert.deepEqual(parse(quote(['command', 'two words', "single'quote"])), ['command', 'two words', "single'quote"])
})

test('indexed source maps reject amplifying offsets before serialization', () => {
  const { SourceMapConsumer } = require('source-map-js')
  const map = { version: 3, sources: ['fixture.js'], names: [], mappings: 'AAAA' }
  const indexed = line => ({ version: 3, sections: [{ offset: { line, column: 0 }, map }] })
  assert.throws(() => new SourceMapConsumer(indexed(1e8)), /offset/i)
  const valid = new SourceMapConsumer(indexed(2))
  assert.equal(valid.originalPositionFor({ line: 3, column: 1 }).source, 'fixture.js')
})

test('shared caches never reuse security-zeroed responses via max-stale', () => {
  const CachePolicy = require('http-cache-semantics')
  const request = { url: 'https://fixture.invalid/', headers: { host: 'fixture.invalid' } }
  for (const headers of [
    { 'set-cookie': 'fixture=session' },
    { 'cache-control': 'proxy-revalidate, max-age=0' },
    { 'cache-control': 'no-cache' },
    { 'cache-control': 'private' }
  ]) {
    const policy = new CachePolicy(request, { status: 200, headers }, { shared: true })
    policy.now = () => Date.now() + 1000
    const staleRequest = { ...request, headers: { ...request.headers, 'cache-control': 'max-stale=99999' } }
    assert.equal(policy.satisfiesWithoutRevalidation(staleRequest), false, JSON.stringify(headers))
    assert.equal(policy.evaluateRequest(staleRequest).response, undefined)
  }
  const publicPolicy = new CachePolicy(request, { status: 200, headers: { 'cache-control': 'public, max-age=0' } })
  publicPolicy.now = () => Date.now() + 1000
  assert.equal(publicPolicy.satisfiesWithoutRevalidation({ ...request, headers: { ...request.headers, 'cache-control': 'max-stale=99999' } }), true)
})

test('git environment parser recognizes VISUAL as an unsafe editor', () => {
  const { parseEnv } = require('@simple-git/argv-parser')
  assert.ok(parseEnv({ VISUAL: 'fixture-editor' }).vulnerabilities.some(v => v.category === 'allowUnsafeEditor'))
  assert.deepEqual(parseEnv({ LANG: 'en_US.UTF-8' }).vulnerabilities, [])
})
