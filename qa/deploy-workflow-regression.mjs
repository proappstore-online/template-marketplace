/**
 * The canonical template deliberately retains APPNAME placeholders, so its
 * deploy workflow must skip only this repository. Apps instantiated from the
 * template retain the same workflow but have a different repository name and
 * must still deploy with all of the normal fail-closed checks.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workflow = readFileSync(fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url)), 'utf8')
const deployStart = workflow.indexOf('  deploy:\n')
const deployEnd = workflow.indexOf('\n  e2e:\n')
const deploy = workflow.slice(deployStart, deployEnd === -1 ? undefined : deployEnd)
const guard = deploy.match(/^    if: (.+)$/m)?.[1]
const canonical = 'template-marketplace'

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`PASS  ${message}`)
}

assert(guard, 'deploy job has an explicit canonical-template guard')
assert(
  guard.includes(`github.event.repository.name != '${canonical}'`),
  'the canonical marketplace template is skipped before its APPNAME placeholder check',
)
assert(
  guard.includes("github.event.repository.name != 'template-app'"),
  'the existing template-app canonical guard remains intact',
)
assert(
  !/startsWith\(github\.event\.repository\.name, ['"]template-/.test(guard),
  'the guard does not broadly skip generated apps with template-like names',
)

const shouldDeploy = (repositoryName) => !new Set(['template-app', canonical]).has(repositoryName)
assert(!shouldDeploy(canonical), 'canonical template deployment is skipped')
assert(shouldDeploy('my-market'), 'a generated marketplace app still deploys')
assert(shouldDeploy('template-like-market'), 'a generated app with a template-like name still deploys')
assert(/pnpm build/.test(deploy) && /::error::/.test(deploy), 'generated-app build remains fail-closed')
