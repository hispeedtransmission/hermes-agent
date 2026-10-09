import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, delimiter } from 'node:path'

const repo = resolve(import.meta.dirname, '..')
test('prepare preserves an existing hooksPath without invoking lefthook', () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-hooks-'))
  try {
    const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' }
    execFileSync('git', ['init', '-q', root], { env })
    execFileSync('git', ['config', '--global', 'core.hooksPath', join(root, 'authority')], { env })
    mkdirSync(join(root, 'bin'))
    const windows = process.platform === 'win32'
    writeFileSync(join(root, 'bin', windows ? 'lefthook.cmd' : 'lefthook'),
      windows ? '@echo off\r\necho called>lefthook-was-run\r\n' : '#!/bin/sh\ntouch lefthook-was-run\n', { mode: 0o755 })
    env.PATH = `${join(root, 'bin')}${delimiter}${env.PATH}`
    execFileSync(process.execPath, [join(repo, 'scripts/prepare-hooks.mjs')], { cwd: root, env })
    assert.equal(existsSync(join(root, 'lefthook-was-run')), false)
    assert.equal(execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, env, encoding: 'utf8' }).trim(), join(root, 'authority'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
