import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'

import { test } from 'vitest'

import { REMOTE_PROCESS_ARGS_PY } from './remote-process-args'

test.skipIf(process.platform === 'win32')('native process argv preserves spaces, quotes, and empty arguments', async () => {
  const python = process.env.HERMES_PYTHON || 'python3'
  const values = ['a path with spaces', '', 'a"quote', "another'quote"]

  const child = spawn(python, ['-u', '-c', 'import time; print("ready", flush=True); time.sleep(30)', ...values], {
    stdio: ['ignore', 'pipe', 'ignore']
  })

  try {
    await once(child.stdout!, 'data')
    const args = JSON.parse(execFileSync(python, ['-c', `import sys,json\n${REMOTE_PROCESS_ARGS_PY}\nprint(json.dumps(process_args(${child.pid})))`], { encoding: 'utf8' }))
    assert.deepEqual(args.slice(-values.length), values)
  } finally {
    child.kill()
    await once(child, 'exit')
  }
})
