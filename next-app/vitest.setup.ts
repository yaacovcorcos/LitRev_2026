import { vi } from 'vitest'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables for tests that need them (like DB tests).
// Keep dotenv quiet so test output stays high-signal.
dotenv.config({ path: path.resolve(__dirname, '.env.local'), quiet: true })
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true })

// Mock server-only globally so server modules can be imported in tests
vi.mock('server-only', () => ({}))

// Register axe-core a11y matchers (safe in node env — only extends expect)
import 'vitest-axe/extend-expect'

// cmdk relies on ResizeObserver in browser-like tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverMock
}

if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {}
}

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null
}
