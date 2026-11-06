/** The shared platform workflow owns template guards and deploy verification. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
assert.match(workflow, /uses: proappstore-online\/platform\/\.github\/workflows\/app-deploy\.yml@app-deploy-v1/,
  'deployment delegates to the canonical guarded pipeline')
assert.match(workflow, /id-token: write/, 'the keyless pipeline can request OIDC tokens')
assert.match(workflow, /contents: read/, 'the pipeline can read the app repository')
assert.match(workflow, /secrets: inherit/, 'runner routing receives the repository-scoped billing token')
assert.doesNotMatch(workflow, /e2e:\s*none/, 'generated apps retain automatic E2E detection')
assert.doesNotMatch(workflow, /continue-on-error:\s*true/, 'deployment failures remain failures')
console.log('PASS  marketplace delegates to the canonical fail-closed deploy workflow')
