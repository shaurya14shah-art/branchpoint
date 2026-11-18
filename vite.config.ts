import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { aiDevMiddleware } from './server/ai.ts'

export default defineConfig({
  plugins: [react(), aiDevMiddleware()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
})
