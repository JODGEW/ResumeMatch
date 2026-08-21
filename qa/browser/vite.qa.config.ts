import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const requiredEnvironment = {
  QA_INVOCATION_ID: process.env.QA_INVOCATION_ID,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL,
  VITE_API_KEY: process.env.VITE_API_KEY,
  VITE_COGNITO_OAUTH_DOMAIN: process.env.VITE_COGNITO_OAUTH_DOMAIN,
  VITE_APP_URL: process.env.VITE_APP_URL,
}
if (
  !requiredEnvironment.QA_INVOCATION_ID
  || requiredEnvironment.VITE_API_BASE_URL !== 'https://api.qa.invalid'
  || requiredEnvironment.VITE_API_KEY !== 'qa-synthetic-api-key-not-secret'
  || requiredEnvironment.VITE_COGNITO_OAUTH_DOMAIN !== 'auth.qa.invalid'
  || requiredEnvironment.VITE_APP_URL !== 'https://app.qa.invalid'
) {
  throw new Error('QA Vite configuration requires the sanitized Phase 1 launcher environment')
}

export default defineConfig({
  root: repositoryRoot,
  cacheDir: path.join(repositoryRoot, '.qa-artifacts', 'runtime', requiredEnvironment.QA_INVOCATION_ID, 'vite-cache'),
  envDir: path.join(repositoryRoot, 'qa/fixtures/environment'),
  plugins: [
    react(),
    {
      name: 'qa-synthetic-index-origins',
      transformIndexHtml(html) {
        return html.replaceAll('https://resumematchapp.com', 'https://app.qa.invalid')
      },
    },
  ],
  build: {
    outDir: path.join(repositoryRoot, '.qa-dist'),
    emptyOutDir: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
