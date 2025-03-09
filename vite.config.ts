import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'e7eb-2409-40f4-117-44dd-e8c2-1a71-8bab-3795.ngrok-free.app'
    ]
  }
})
