import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'b59d-2409-40f4-117-44dd-f51e-44f0-d9ac-cce4.ngrok-free.app'
    ]
  }
})
