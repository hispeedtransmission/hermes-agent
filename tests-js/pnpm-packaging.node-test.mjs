import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pinnedPackageRoot } from '../apps/desktop/scripts/prepare-packaging-tools.mjs'
import { packagingIdentity } from '../apps/desktop/scripts/prepared-packaging.mjs'
import { recordNativeInputs, readNativeInputs } from '../apps/desktop/scripts/prepared-native-deps.mjs'

const repo = resolve(import.meta.dirname, '..')
test('packaging admits the real pnpm installed lock-pinned builder', () => {
  assert.equal(pinnedPackageRoot(repo, 'electron-builder'), realpathSync(join(repo, 'apps/desktop/node_modules/electron-builder')))
})
test('native and packaging receipts invalidate when the pnpm lock changes', () => {
  const source = mkdtempSync(join(tmpdir(), 'hermes-native-pnpm-'))
  try {
    for (const file of ['package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/desktop/package.json', 'apps/desktop/electron-builder.config.cjs']) {
      mkdirSync(join(source, file, '..'), { recursive: true })
      cpSync(join(repo, file), join(source, file))
    }
    cpSync(join(repo, 'apps/desktop/electron/native'), join(source, 'apps/desktop/electron/native'), { recursive: true })
    const out = join(source, 'native-deps')
    mkdirSync(join(out, 'node-pty'), { recursive: true })
    writeFileSync(join(out, 'node-pty/package.json'), '{}')
    const identity = packagingIdentity(source)
    recordNativeInputs({ source, out, platform: process.platform, arch: process.arch })
    readNativeInputs({ source, nativeDeps: out })
    writeFileSync(join(source, 'pnpm-lock.yaml'), readFileSync(join(source, 'pnpm-lock.yaml'), 'utf8') + '\n# changed\n')
    assert.notEqual(packagingIdentity(source), identity)
    assert.throws(() => readNativeInputs({ source, nativeDeps: out }), /Stale/)
  } finally { rmSync(source, { recursive: true, force: true }) }
})
