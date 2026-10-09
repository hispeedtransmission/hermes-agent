import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import setup from '../vitest.run-tmp'

test('scratch fixtures cannot discover a repository above the run temp root', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'parent-repo-'))
  const keys = ['TMPDIR', 'TMP', 'TEMP', 'GIT_CEILING_DIRECTORIES']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  let cleanup: (() => void) | undefined

  try {
    execFileSync('git', ['init', '-q', parent])
    process.env.TMPDIR = parent
    cleanup = setup()
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'))
    assert.notEqual(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: fixture }).status, 0)
    execFileSync('git', ['init', '-q', fixture])
    assert.equal(fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: fixture, encoding: 'utf8' }).trim()), fs.realpathSync(fixture))
  } finally {
    cleanup?.()

    for (const key of keys) {
      if (saved[key] === undefined) {delete process.env[key]}
      else {process.env[key] = saved[key]}
    }

    fs.rmSync(parent, { recursive: true, force: true })
  }
})
