// A configured hooksPath is an existing authority, not ours to replace.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (existsSync('.git')) {
  const configured = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' })
  if (configured.error) throw configured.error
  if (configured.status === 0) {
    console.log(`prepare: preserving core.hooksPath=${configured.stdout.trim()}`)
  } else if (configured.status === 1) {
    const installed = spawnSync('lefthook', ['install'], { stdio: 'inherit', shell: process.platform === 'win32' })
    if (installed.error) throw installed.error
    process.exitCode = installed.status ?? 1
  } else {
    throw new Error(`Cannot read Git hook configuration: ${configured.stderr}`)
  }
}
