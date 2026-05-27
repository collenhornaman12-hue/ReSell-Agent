import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    proxy: {
      '/api/listing': 'http://localhost:8789',
      '/api/pricing': 'http://localhost:8788',
      '/api/vision': 'http://localhost:8787',
    },
  },
})
