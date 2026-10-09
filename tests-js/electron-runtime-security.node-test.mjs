import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

test('shipped Electron embeds an Undici outside the audited affected ranges', () => {
  const versions = JSON.parse(execFileSync(require('electron'), ['-e', 'console.log(JSON.stringify(process.versions))'], {
    encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }))
  const { satisfies } = require('semver')
  assert.ok(versions.electron, 'must test Electron, not the host Node')
  assert.ok(versions.undici, 'embedded Undici must be inventoried independently of package audit')
  assert.equal(satisfies(versions.undici, '<6.28.1 || >=7.0.0 <7.29.1'), false,
    `embedded Undici ${versions.undici} still matches the audited advisory ranges`)
})
