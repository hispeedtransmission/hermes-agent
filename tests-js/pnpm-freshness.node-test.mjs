import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sourceHash } from '../scripts/build/freshness.mjs'

test('every product is invalidated by pnpm lock or workspace policy changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-pnpm-freshness-'))
  try {
    for (const product of ['tui', 'web', 'desktop']) {
      for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
        const before = sourceHash(root, product)
        writeFileSync(join(root, file), `# ${product} changed\n`)
        assert.notEqual(sourceHash(root, product), before, `${product}: ${file}`)
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
