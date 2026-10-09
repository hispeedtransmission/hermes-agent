import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareNodeDependencies } from '../scripts/build/node-deps.mjs'

test('get-windows remains an optional cross-platform dependency on non-Windows hosts', { skip: process.platform === 'win32' }, () => {
  const source = mkdtempSync(join(tmpdir(), 'hermes-optional-platform-'))
  try {
    mkdirSync(join(source, 'web'))
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'root-fixture', private: true }))
    writeFileSync(join(source, 'web/package.json'), JSON.stringify({ name: 'web', optionalDependencies: { 'get-windows': '9.3.0' } }))
    const hook = resolve(import.meta.dirname, '../.pnpmfile.cjs')
    if (existsSync(hook)) cpSync(hook, join(source, '.pnpmfile.cjs'))
    execFileSync('pnpm', ['config', 'set', '--location=project', '--json', 'packages', '["web"]'], { cwd: source })
    execFileSync('pnpm', ['config', 'set', '--location=project', '--json', 'allowBuilds', '{"get-windows@9.3.0":true}'], { cwd: source })
    execFileSync('pnpm', ['config', 'set', '--location=project', 'minimumReleaseAge', '20160'], { cwd: source })
    execFileSync('pnpm', ['install', '--lockfile-only'], { cwd: source })
    prepareNodeDependencies({ source, workspaces: ['web'], reuse: true })
    assert.ok(existsSync(join(source, 'web/node_modules/get-windows/package.json')))
  } finally { rmSync(source, { recursive: true, force: true }) }
})
