/**
 * Regression coverage for the generated app's pre-commit hook. The fixtures
 * deliberately use a renamed workspace package, then make real git commits so
 * the hook (rather than lint-staged in isolation) is exercised.
 *
 *   node --no-warnings qa/lint-staged-regression.mjs
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fixture = mkdtempSync(join(tmpdir(), 'template-marketplace-lint-staged-'))
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: fixture,
    encoding: 'utf8',
    env: process.env,
    ...options,
  })
  if (result.error) throw result.error
  return result
}

function mustSucceed(command, args, options) {
  const result = run(command, args, options)
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
  return result
}

try {
  // Config shape is the guarantee that lint-staged cannot append staged paths.
  const config = (await import(`${pathToFileURL(join(root, '.lintstagedrc.js')).href}?test=${Date.now()}`)).default
  for (const commands of Object.values(config)) {
    assert.ok(commands.every((command) => typeof command === 'function'), 'lint-staged commands must be functions')
    for (const command of commands) assert.equal(command(['web/src/App.tsx']), command([]))
  }

  cpSync(root, fixture, {
    recursive: true,
    filter: (source) => !['.git', 'node_modules', 'dist'].includes(basename(source)),
  })
  // Reuse the installed dependencies while preserving an otherwise isolated app.
  symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'))
  symlinkSync(join(root, 'web', 'node_modules'), join(fixture, 'web', 'node_modules'))

  const appName = 'tradies'
  for (const relative of ['package.json', 'web/package.json']) {
    const path = join(fixture, relative)
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('APPNAME', appName))
  }

  mustSucceed('git', ['init'])
  mustSucceed('git', ['config', 'user.email', 'template-test@example.com'])
  mustSucceed('git', ['config', 'user.name', 'Template regression test'])
  mustSucceed('git', ['add', '.'])
  mustSucceed('git', ['commit', '-m', 'fixture baseline'])
  // Husky's install command is run explicitly so this is a genuine git hook.
  mustSucceed('pnpm', ['exec', 'husky'])

  const app = join(fixture, 'web/src/App.tsx')
  writeFileSync(app, `${readFileSync(app, 'utf8')}\n// valid staged edit\n`)
  mustSucceed('git', ['add', 'web/src/App.tsx'])
  mustSucceed('git', ['commit', '-m', 'valid staged TypeScript edit'])

  writeFileSync(app, `${readFileSync(app, 'utf8')}\nconst precommitTypeFailure: string = 42\n`)
  mustSucceed('git', ['add', 'web/src/App.tsx'])
  const failedCommit = run('git', ['commit', '-m', 'intentional type failure'])
  assert.notEqual(failedCommit.status, 0, 'a type error must block the pre-commit hook')
  assert.match(`${failedCommit.stdout}${failedCommit.stderr}`, /Type 'number' is not assignable to type 'string'/)

  console.log('PASS  lint-staged functions ignore filenames; renamed generated fixture accepts valid commits and rejects type errors')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
