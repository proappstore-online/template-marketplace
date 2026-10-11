/**
 * A template has intentional APPNAME placeholders, but an instantiated app must
 * pass the same static check and bundle normally. This fixture replaces every
 * source placeholder before running the generated app's check, typecheck and build.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fixture = mkdtempSync(join(tmpdir(), 'template-marketplace-generated-'))
const textExtensions = new Set(['.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yaml', '.yml'])

function run(command, args) {
  const result = spawnSync(command, args, { cwd: fixture, encoding: 'utf8', env: process.env })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
}

function replaceAppName(directory, appName) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) replaceAppName(path, appName)
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      writeFileSync(path, readFileSync(path, 'utf8').replaceAll('APPNAME', appName))
    }
  }
}

try {
  cpSync(root, fixture, {
    recursive: true,
    filter: (source) => !['.git', 'dist', 'node_modules'].includes(basename(source)),
  })
  // Reuse the installed dependency links while keeping the generated workspace isolated.
  symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'))
  symlinkSync(join(root, 'web', 'node_modules'), join(fixture, 'web', 'node_modules'))

  const appName = 'market-regression'
  replaceAppName(fixture, appName)
  assert.equal(readFileSync(join(fixture, 'web/src/api.ts'), 'utf8').includes('APPNAME'), false, 'generated source has no app-id placeholder')
  assert.equal(readFileSync(join(fixture, 'package.json'), 'utf8').includes('APPNAME'), false, 'generated workspace scripts target the replacement app id')

  const appSource = readFileSync(join(fixture, 'web/src/App.tsx'), 'utf8')
  const html = readFileSync(join(fixture, 'web/index.html'), 'utf8')
  const viteConfig = readFileSync(join(fixture, 'web/vite.config.ts'), 'utf8')
  assert.match(appSource, /PUBLIC\.has\(route\.name\)/, 'the public catalogue remains available while signed out')
  assert.match(appSource, /<SignInButton app=\{app\}/, 'signed-out and sign-in-gated views keep a sign-in control')
  assert.match(appSource, /<ProShell app=\{app\} appName="market-regression" branding="app" nav=\{NAV\}/, 'the signed-in shell uses app-owned branding and keeps its navigation')
  assert.match(appSource, /label: 'Settings'/, 'the shell keeps profile, text-size and accessibility settings navigation')
  assert.doesNotMatch(appSource, /Built for ProAppStore|proappstore\.online/, 'the application UI has no forced platform attribution')
  assert.doesNotMatch(html, /ProAppStore/, 'generated HTML metadata is app-owned')
  assert.doesNotMatch(viteConfig, /ProAppStore/, 'generated PWA metadata is app-owned')

  run('pnpm', ['typecheck'])
  run('node', ['--no-warnings', 'qa/actions.mjs'])
  run('pnpm', ['build'])

  const manifest = JSON.parse(readFileSync(join(fixture, 'web/dist/manifest.webmanifest'), 'utf8'))
  assert.deepEqual(
    { name: manifest.name, short_name: manifest.short_name, description: manifest.description },
    { name: appName, short_name: appName, description: 'Browse listings, save favourites, send requests and message owners.' },
    'the generated PWA manifest has app-owned identity and description',
  )
  console.log('PASS  APPNAME-replaced generated app preserves public/sign-in/shell controls, app-owned metadata, and build')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
