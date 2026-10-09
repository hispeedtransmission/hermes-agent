// pnpm's own lock and installed metadata certify a pnpm tree; never emulate npm's hidden lock.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, delimiter } from 'node:path'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const stale = () => new Error('Workspace dependencies are stale or missing and lazy installs are disabled; run an explicit build/update')

function packageManifests(source, projects) {
  const paths = new Set()
  function modules(dir) {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      if (name.startsWith('@')) { modules(join(dir, name)); continue }
      const file = join(dir, name, 'package.json')
      if (existsSync(file)) paths.add(relative(source, file))
    }
  }
  for (const project of projects) modules(join(project.path, 'node_modules'))
  const store = join(source, 'node_modules/.pnpm')
  if (existsSync(store)) for (const name of readdirSync(store)) modules(join(store, name, 'node_modules'))
  return [...paths].sort()
}

function matches(source, receipt, key, nativeKey) {
  try {
    const saved = JSON.parse(readFileSync(receipt, 'utf8'))
    return saved.manager === 'pnpm' && saved.key === key
      && (nativeKey === undefined || saved.nativeKey === nativeKey)
      && Object.entries(saved.files).every(([file, hash]) => digest(readFileSync(join(source, file))) === hash)
  } catch { return false }
}

export function preparePnpmDependencies({ source, workspaces, env, reuse, install, nativeToolchain }) {
  let command = ['pnpm']
  if (process.platform === 'win32') {
    // .cmd requires a shell; launch pnpm/Corepack's JS entry instead so arguments stay argv.
    const candidates = [env.npm_execpath, ...(env.PATH || env.Path || '').split(delimiter).flatMap(dir => [
      join(dir, 'node_modules/pnpm/bin/pnpm.cjs'), join(dir, 'node_modules/corepack/dist/pnpm.js'),
    ])]
    const cli = candidates.find(file => file && /[/\\]pnpm\.(c?js)$/.test(file) && existsSync(file))
    if (!cli) throw new Error('pnpm JavaScript CLI is required on PATH')
    command = [process.execPath, cli]
  }
  const run = (args, stdio = 'pipe') => execFileSync(command[0], [...command.slice(1), ...args],
    { cwd: source, env, encoding: 'utf8', stdio })
  const version = run(['--version']).trim()
  const projects = JSON.parse(run(['list', '-r', '--depth', '-1', '--json']))
  const selected = [...new Set(workspaces.map(workspace => {
    const project = projects.find(p => relative(source, p.path).replaceAll('\\', '/') === workspace || p.name === workspace)
    if (!project || project.path === source) throw new Error(`Unknown or missing pnpm workspace: ${workspace}`)
    return relative(source, project.path).replaceAll('\\', '/')
  }))].sort()
  // pnpm's ... filter does not follow npm-compatible file: workspace links.
  const closure = new Set([source, ...selected.map(path => join(source, path))])
  for (const path of closure) {
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    for (const spec of Object.values({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies })) {
      if (!/^(file|link):/.test(spec)) continue
      const target = resolve(path, spec.replace(/^(file|link):/, ''))
      if (projects.some(p => p.path === target)) closure.add(target)
    }
  }
  const args = ['install', '--frozen-lockfile', '--prod=false', '--config.engine-strict=true',
    '--config.side-effects-cache=false',
    ...[...closure].sort().flatMap(path => ['--filter', projects.find(p => p.path === path).name + '...'])]
  const inputs = createHash('sha256').update(JSON.stringify({
    manager: 'pnpm', version, node: process.versions.node, platform: process.platform, arch: process.arch, args,
    config: Object.entries(env).filter(([name]) => /^(npm|pnpm)_config_/i.test(name)
      && !/_(cache|store_dir|offline|prefer_offline|verify_deps_before_run)$/i.test(name))
      .map(([name, value]) => [name.toLowerCase(), value]).sort(),
  }))
  const manifests = new Set(projects.map(p => join(p.path, 'package.json')))
  for (const file of manifests) {
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    for (const spec of Object.values({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies })) {
      if (!/^(file|link):/.test(spec)) continue
      const local = resolve(file, '..', spec.replace(/^(file|link):/, ''), 'package.json')
      if (existsSync(local)) manifests.add(local)
    }
  }
  const files = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', 'scripts/prepare-hooks.mjs',
    'scripts/build/pnpm-deps.mjs', 'scripts/build/node-deps.mjs',
    ...[...manifests].map(file => relative(source, file))].sort()
  for (const file of files) inputs.update(file).update('\0').update(existsSync(join(source, file)) ? readFileSync(join(source, file)) : '<missing>').update('\0')
  const key = inputs.digest('hex')
  const receipt = join(source, 'node_modules/.hermes-pnpm-deps.json')
  const nativeKey = nativeToolchain === undefined ? undefined : JSON.stringify(nativeToolchain)
  if (reuse && matches(source, receipt, key, nativeKey)) {
    console.log(`node-deps: reusing completed pnpm install (${selected.join(', ')})`)
    return { source, workspaces: selected }
  }
  if (!install) throw stale()
  // Like npm ci, start clean: pnpm otherwise trusts its metadata even after a partial cleanup.
  // Only generated dependency directories are removed; no config or Git hooks are touched.
  rmSync(receipt, { force: true })
  for (const project of projects) rmSync(join(project.path, 'node_modules'), { recursive: true, force: true })
  console.log(`node-deps: installing locked pnpm workspace dependencies (${selected.join(', ')})...`)
  run(args, 'inherit')
  const installedFiles = ['node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml', ...packageManifests(source, projects)]
  const installed = Object.fromEntries(installedFiles.map(file => [file, digest(readFileSync(join(source, file)))]))
  if (reuse) writeFileSync(receipt, JSON.stringify({ manager: 'pnpm', key, nativeKey, files: installed }) + '\n')
  return { source, workspaces: selected }
}
