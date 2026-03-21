import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/__fixtures__/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'server-only': path.resolve(__dirname, './test-utils/server-only-stub.ts'),
    },
  },
})
