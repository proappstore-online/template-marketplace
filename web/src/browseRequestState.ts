export interface BrowseCriteria {
  query: string
  category: string
}

export interface BrowseCursor {
  created_at: number
  id: string
}

/** A stable identity for one criteria/cursor pair, used to suppress duplicate page requests. */
export function browseRequestKey(criteria: BrowseCriteria, cursor?: BrowseCursor): string {
  return JSON.stringify([criteria.query, criteria.category, cursor?.created_at ?? null, cursor?.id ?? null])
}

/**
 * Coordinates requests without tying the policy to React. A newer criteria change
 * invalidates older responses, while a second request for the same page is ignored.
 */
export function createBrowseRequestGate() {
  let latest = 0
  const inFlight = new Map<string, number>()

  return {
    start(key: string): number | null {
      if (inFlight.has(key)) return null
      const token = ++latest
      inFlight.set(key, token)
      return token
    },
    invalidate(): void {
      latest++
      inFlight.clear()
    },
    isCurrent(token: number): boolean {
      return token === latest
    },
    finish(key: string, token: number): void {
      if (inFlight.get(key) === token) inFlight.delete(key)
    },
  }
}

/** Preserve first-seen ordering if an API retry ever returns an overlapping page. */
export function mergeListings<T extends { id: string }>(current: T[], page: T[]): T[] {
  const ids = new Set(current.map((row) => row.id))
  return [...current, ...page.filter((row) => !ids.has(row.id))]
}
