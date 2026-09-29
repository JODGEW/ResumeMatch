import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fixed port, fail if taken (RM-25). http://localhost:5173 is the only local
  // origin in the Deepgram token Lambda's ALLOWED_ORIGINS; if Vite silently
  // moved to :5174, every voice-input token mint would be blocked by CORS and
  // surface as "Network Error" with nothing pointing at the port.
  server: {
    port: 5173,
    strictPort: true,
  },
})
