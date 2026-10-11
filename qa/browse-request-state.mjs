import assert from 'node:assert/strict'
import { browseRequestKey, createBrowseRequestGate, mergeListings } from '../web/src/browseRequestState.ts'

const criteria = { query: 'shared', category: 'sale' }
const first = browseRequestKey(criteria)
const second = browseRequestKey(criteria, { created_at: 1000, id: 'tied-24' })
assert.notEqual(first, second, 'initial and load-more requests have different identities')

const gate = createBrowseRequestGate()
const initial = gate.start(first)
assert.ok(initial !== null, 'the initial request starts')
assert.equal(gate.start(first), null, 'a repeated initial request is deduplicated')
const loadMore = gate.start(second)
assert.ok(loadMore !== null, 'a distinct cursor page may start')
assert.equal(gate.start(second), null, 'a repeated load-more request is deduplicated')

gate.invalidate()
assert.equal(gate.isCurrent(initial), false, 'a filter change makes an older response stale')
assert.equal(gate.isCurrent(loadMore), false, 'a filter change also makes an older page stale')
const refreshedFirst = gate.start(first)
assert.ok(refreshedFirst !== null, 'a changed filter can later return to a fresh first page')
gate.finish(first, initial)
assert.equal(gate.start(first), null, 'stale cleanup cannot release a newer in-flight request for the same page')
gate.invalidate()
const changedFilter = gate.start(browseRequestKey({ query: 'shared', category: 'rent' }))
assert.ok(changedFilter !== null && gate.isCurrent(changedFilter), 'changed criteria reset to a fresh first page')

const merged = mergeListings([{ id: 'one' }, { id: 'two' }], [{ id: 'two' }, { id: 'three' }])
assert.deepEqual(merged.map((row) => row.id), ['one', 'two', 'three'], 'overlapping retry pages cannot duplicate cards')

console.log('PASS  browse request state ignores stale responses and deduplicates pages')
