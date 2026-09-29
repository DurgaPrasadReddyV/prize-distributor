import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this app from /prize-distributor/, not from the root, so
// the base path must be set here or every asset 404s in production.
export default defineConfig({
  base: '/prize-distributor/',
  plugins: [react()],
})
