import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input } from '@proappstore/sdk/ui'
import { app, pub, q, x, CATEGORIES, type Listing } from '../api'
import { browseRequestKey, createBrowseRequestGate, mergeListings, type BrowseCriteria, type BrowseCursor } from '../browseRequestState'
import { Empty, ListingCard, Section } from '../components'

const PAGE_SIZE = 24
const SEARCH_DEBOUNCE_MS = 250

/** Saved ids for the signed-in user; empty and inert when signed out. */
export function useSaved() {
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const signedIn = !!app.auth.user
  useEffect(() => {
    if (!signedIn) return
    q<{ listing_id: string }>('list_my_favorite_ids').then((rows) => setSaved(new Set(rows.map((r) => r.listing_id)))).catch(() => {})
  }, [signedIn])
  const toggle = useCallback(async (id: string) => {
    if (!signedIn) { location.hash = '#/saved'; return }
    const has = saved.has(id)
    const next = new Set(saved)
    if (has) next.delete(id); else next.add(id)
    setSaved(next)
    await x(has ? 'remove_favorite' : 'add_favorite', { listing_id: id })
  }, [saved, signedIn])
  return { saved, toggle, signedIn }
}

export function Browse() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [rows, setRows] = useState<Listing[]>([])
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(true)
  const { saved, toggle, signedIn } = useSaved()
  const requestGate = useRef(createBrowseRequestGate())
  const debounceTimer = useRef<number | null>(null)
  const criteria = useMemo<BrowseCriteria>(() => ({ query: query.trim(), category }), [query, category])

  const load = useCallback(async (nextCriteria: BrowseCriteria, cursor?: BrowseCursor) => {
    const key = browseRequestKey(nextCriteria, cursor)
    const token = requestGate.current.start(key)
    if (token === null) return
    setBusy(true)
    try {
      const params = { category: nextCriteria.category || null, before: cursor?.created_at ?? null, before_id: cursor?.id ?? null }
      const page = nextCriteria.query
        ? await pub<Listing>('search_listings', { q: nextCriteria.query, ...params })
        : await pub<Listing>('list_listings', params)
      if (!requestGate.current.isCurrent(token)) return
      setRows((previous) => cursor ? mergeListings(previous, page) : page)
      setDone(page.length < PAGE_SIZE)
    } catch {
      // The current empty/error state is intentionally kept; a later criteria change wins.
    } finally {
      requestGate.current.finish(key, token)
      if (requestGate.current.isCurrent(token)) setBusy(false)
    }
  }, [])

  const resetAndLoad = useCallback((nextCriteria: BrowseCriteria, debounce: boolean) => {
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
    requestGate.current.invalidate()
    setRows([])
    setDone(false)
    setBusy(true)
    const start = () => {
      debounceTimer.current = null
      void load(nextCriteria)
    }
    if (debounce) debounceTimer.current = window.setTimeout(start, SEARCH_DEBOUNCE_MS)
    else start()
  }, [load])

  useEffect(() => {
    resetAndLoad(criteria, true)
    return () => {
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
    }
  }, [criteria, resetAndLoad])

  return (
    <Section title="Browse">
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); resetAndLoad(criteria, false) }} role="search">
        <div className="min-w-48 flex-1"><Input aria-label="Search" placeholder="Search title, description or location" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {rows.length === 0 && !busy ? <Empty title="No listings yet" description="Be the first: sign in and publish one." /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((l) => <ListingCard key={l.id} listing={l} saved={saved.has(l.id)} onToggleSave={signedIn ? () => toggle(l.id) : undefined} />)}
      </div>
      {!done ? <div className="mt-6 text-center"><Button variant="ghost" loading={busy} onClick={() => {
        const last = rows[rows.length - 1]
        if (last) void load(criteria, { created_at: last.created_at, id: last.id })
      }}>Load more</Button></div> : null}
    </Section>
  )
}

export function Saved() {
  const [rows, setRows] = useState<Listing[] | null>(null)
  const { saved, toggle } = useSaved()
  useEffect(() => { q<Listing>('list_my_favorites').then(setRows) }, [saved.size])
  return (
    <Section title="Saved">
      {rows && rows.length === 0 ? <Empty title="Nothing saved" description="Tap the heart on a listing to keep it here." /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(rows ?? []).map((l) => <ListingCard key={l.id} listing={l} saved onToggleSave={() => toggle(l.id)} />)}
      </div>
    </Section>
  )
}
