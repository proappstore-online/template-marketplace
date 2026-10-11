// @vitest-environment happy-dom
/**
 * Minimal app-level rendering coverage for the generated marketplace.
 *
 * The SDK's own shell.test.tsx owns exhaustive shell behaviour coverage. These
 * tests mount this template's real App against the installed SDK and synthetic
 * fixtures to verify the template keeps its public/protected route boundary and
 * passes app-owned branding into the real shell. No platform endpoint is used.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const user = { id: 'user-1', name: 'Test User', login: 'tester', avatarUrl: null }
  const signIn = vi.fn()
  const signOut = vi.fn(async () => {})
  const auth: Record<string, unknown> = {
    user,
    token: 'synthetic-token',
    status: 'signed-in',
    init: vi.fn(async () => {}),
    onChange: vi.fn(() => () => {}),
    signIn,
    signOut,
  }
  auth.onStatus = vi.fn((listener: (status: string, currentUser: typeof user | null) => void) => {
    listener(auth.status as string, auth.user as typeof user | null)
    return () => {}
  })
  const app = {
    appId: 'marketplace-rendered-test',
    auth,
    subscription: {
      status: vi.fn(async () => ({ status: 'active' })),
      openPortal: vi.fn(async () => {}),
    },
  }
  return { app, auth, signIn, signOut, user, appAuth: { user: null as typeof user | null, loading: false } }
})

vi.mock('@proappstore/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@proappstore/sdk')>()
  return { ...actual, useAuth: () => fixture.appAuth }
})

vi.mock('../api', () => ({
  app: fixture.app,
  REQUEST: { noun: 'request', plural: 'requests', verb: 'Request' },
}))

vi.mock('../pages/Browse', () => ({
  Browse: () => <p data-screen="browse">Public browse</p>,
  Saved: () => <p data-screen="saved">Saved listings</p>,
}))
vi.mock('../pages/Listing', () => ({ ListingPage: ({ id }: { id: string }) => <p data-screen="listing">Listing {id}</p> }))
vi.mock('../pages/Requests', () => ({
  MyRequests: () => <p data-screen="requests">Requests</p>,
  Inbox: () => <p data-screen="inbox">Inbox</p>,
}))
vi.mock('../pages/Owner', () => ({
  OwnerDashboard: () => <p data-screen="mine">My listings</p>,
  ListingForm: () => <p data-screen="form">Listing form</p>,
}))
vi.mock('../pages/Messages', () => ({
  Conversations: () => <p data-screen="messages">Messages</p>,
  Thread: () => <p data-screen="thread">Thread</p>,
}))
vi.mock('../pages/Settings', () => ({ Settings: () => <p data-screen="settings">Settings</p> }))

import App from '../App'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function setSignedOut() {
  fixture.appAuth = { user: null, loading: false }
  fixture.auth.user = null
  fixture.auth.token = null
  fixture.auth.status = 'signed-out'
}

function setSignedIn() {
  fixture.appAuth = { user: fixture.user, loading: false }
  fixture.auth.user = fixture.user
  fixture.auth.token = 'synthetic-token'
  fixture.auth.status = 'signed-in'
}

async function mount() {
  await act(async () => { root.render(<App />) })
  await act(async () => { await Promise.resolve() })
}

async function waitFor(assertion: () => void) {
  await vi.waitFor(assertion, { timeout: 1_000 })
}

beforeEach(() => {
  fixture.signIn.mockClear()
  fixture.signOut.mockClear()
  fixture.app.subscription.status.mockClear()
  setSignedOut()
  window.history.replaceState(null, '', '/')
  document.documentElement.removeAttribute('data-text')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('marketplace rendered integration', () => {
  it('keeps public browse and listing routes available while signed out', async () => {
    window.location.hash = '#/'
    await mount()
    expect(container.querySelector('[data-screen="browse"]')?.textContent).toBe('Public browse')

    await act(async () => { window.location.hash = '#/l/listing-42' })
    await waitFor(() => expect(container.querySelector('[data-screen="listing"]')?.textContent).toBe('Listing listing-42'))
    expect(container.textContent).not.toContain('Sign in to continue')
  })

  it('blocks protected routes and wires the real SDK sign-in control', async () => {
    window.location.hash = '#/saved'
    await mount()
    expect(container.textContent).toContain('Sign in to continue')
    expect(container.querySelector('[data-screen="saved"]')).toBeNull()

    const gateButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Sign in with GitHub')
    expect(gateButton).toBeDefined()
    await act(async () => { gateButton!.click() })
    expect(fixture.signIn).toHaveBeenCalledWith('github')
  })

  it('renders the app-owned signed-in shell with navigation and account controls', async () => {
    setSignedIn()
    window.location.hash = '#/settings'
    await mount()
    await waitFor(() => expect(container.querySelector('[data-screen="settings"]')).not.toBeNull())

    expect(container.textContent).toContain('APPNAME')
    expect(container.textContent).not.toContain('ProAppStore')
    expect(container.querySelector('[href="https://proappstore.online"]')).toBeNull()
    expect(container.querySelector('footer.pas-footer')).toBeNull()
    expect(container.querySelector('nav[aria-label="Main"]')).not.toBeNull()

    const textSize = container.querySelector('button[aria-label^="Text:"]') as HTMLButtonElement
    expect(textSize).not.toBeNull()
    await act(async () => { textSize.click() })
    expect(document.documentElement.dataset.text).toBe('lg')

    const profile = container.querySelector('.pas-topbar__account > div > button') as HTMLButtonElement
    expect(profile).not.toBeNull()
    await act(async () => { profile.click() })
    expect(container.textContent).toContain('Sign out')

    const browse = container.querySelector('nav[aria-label="Main"] a[href="#/"]') as HTMLAnchorElement
    expect(browse).not.toBeNull()
    await act(async () => { browse.click() })
    await waitFor(() => expect(container.querySelector('[data-screen="browse"]')).not.toBeNull())
  })
})
