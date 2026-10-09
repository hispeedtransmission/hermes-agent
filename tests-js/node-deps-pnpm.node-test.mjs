import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareNodeDependencies } from '../scripts/build/node-deps.mjs'

function json(root, file, value) {
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), JSON.stringify(value))
}

test('pnpm installs a locked union, proves reuse, and rejects partial or changed inputs', () => {
  const source = mkdtempSync(join(tmpdir(), 'hermes-pnpm-'))
  const env = { ...process.env, CI: '1' }
  try {
    json(source, 'package.json', { name: 'fixture-root', private: true, scripts: {
      postinstall: `node -e "require('fs').writeFileSync('node_modules/installed',require('crypto').randomUUID())"`,
    } })
    for (const workspace of ['web', 'ui-tui', 'desktop']) {
      json(source, `${workspace}/package.json`, { name: workspace, version: '1.0.0', dependencies: { [`${workspace}-only`]: `file:../deps/${workspace}` } })
      json(source, `deps/${workspace}/package.json`, { name: `${workspace}-only`, version: '1.0.0' })
    }
    json(source, 'deps/web/package.json', { name: 'web-only', version: '1.0.0', dependencies: { leaf: 'file:../../leaf' } })
    json(source, 'leaf/package.json', { name: 'leaf', version: '1.0.0' })
    execFileSync('pnpm', ['config', 'set', '--location=project', '--json', 'packages', JSON.stringify(['web', 'ui-tui', 'desktop', 'deps/*'])], { cwd: source, env })
    execFileSync('pnpm', ['install', '--lockfile-only'], { cwd: source, env })
    const lock = readFileSync(join(source, 'pnpm-lock.yaml'))
    const options = { source, workspaces: ['web', 'ui-tui'], reuse: true, env }
    assert.throws(() => prepareNodeDependencies({ ...options, install: false }), /disabled/)
    assert.equal(existsSync(join(source, 'node_modules')), false)
    prepareNodeDependencies(options)
    assert.equal(existsSync(join(source, 'node_modules/.package-lock.json')), false)
    for (const workspace of options.workspaces) assert.ok(existsSync(join(source, workspace, 'node_modules', `${workspace}-only/package.json`)))
    assert.ok(existsSync(join(source, 'deps/web/node_modules/leaf/package.json')))
    assert.equal(existsSync(join(source, 'desktop/node_modules/desktop-only')), false)
    const artifact = readFileSync(join(source, 'node_modules/installed'), 'utf8')
    prepareNodeDependencies({ ...options, install: false })
    assert.equal(readFileSync(join(source, 'node_modules/installed'), 'utf8'), artifact)
    rmSync(join(source, 'web/node_modules/web-only'))
    assert.throws(() => prepareNodeDependencies({ ...options, install: false }), /disabled/)
    prepareNodeDependencies(options)
    assert.ok(existsSync(join(source, 'web/node_modules/web-only/package.json')))
    assert.notEqual(readFileSync(join(source, 'node_modules/installed'), 'utf8'), artifact)
    assert.deepEqual(readFileSync(join(source, 'pnpm-lock.yaml')), lock)
    writeFileSync(join(source, 'pnpm-workspace.yaml'), readFileSync(join(source, 'pnpm-workspace.yaml'), 'utf8') + '\n# changed policy\n')
    assert.throws(() => prepareNodeDependencies({ ...options, install: false }), /disabled/)
    prepareNodeDependencies({ ...options, nativeToolchain: 'one' })
    prepareNodeDependencies({ ...options, nativeToolchain: 'one', install: false })
    assert.throws(() => prepareNodeDependencies({ ...options, nativeToolchain: 'two', install: false }), /disabled/)
    const lockPath = join(source, 'pnpm-lock.yaml')
    rmSync(lockPath)
    assert.throws(() => prepareNodeDependencies({ ...options, install: false }), /disabled/)
    writeFileSync(lockPath, lock)
    assert.throws(() => prepareNodeDependencies({ ...options, workspaces: ['unknown'] }), /workspace/)
    prepareNodeDependencies({ ...options, install: false })
    json(source, 'leaf/next.json', { name: 'leaf', version: '1.0.1' })
    renameSync(join(source, 'leaf/next.json'), join(source, 'leaf/package.json'))
    assert.throws(() => prepareNodeDependencies({ ...options, install: false }), /disabled/)
  } finally { rmSync(source, { recursive: true, force: true }) }
})
