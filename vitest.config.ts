import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // jsdom gives us a DOM environment so React components can render,
    // and fake-indexeddb can polyfill IndexedDB without a real browser.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Only measure coverage on implementation code, not tests or stubs
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/router.ts', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
