import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the API runs as its own process (npm run dev:server); proxying
    // it keeps the app and the API on one origin, as they are in production.
    proxy: {
      // xfwd passes the browser's own host along, which the API's cross-site check needs.
      '/api': { target: `http://localhost:${process.env.PORT ?? 8787}`, xfwd: true },
    },
  },
})
