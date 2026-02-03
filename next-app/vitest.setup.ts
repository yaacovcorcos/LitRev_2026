import { vi } from 'vitest'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables for tests that need them (like DB tests)
// Load .env.local first (higher priority), then .env
dotenv.config({ path: path.resolve(__dirname, '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '.env') })

// Mock server-only globally so server modules can be imported in tests
vi.mock('server-only', () => ({}))
