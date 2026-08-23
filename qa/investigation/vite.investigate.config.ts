import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Bundles the investigation server to ESM so a plain Node process can run it.
 * Node 18 cannot execute TypeScript, and Phase 2 adds no new dependency for it.
 */
export default defineConfig({
  root: repositoryRoot,
  build: {
    ssr: path.join(repositoryRoot, 'qa/investigation/serverMain.ts'),
    outDir: path.join(repositoryRoot, '.qa-artifacts', 'investigation-runtime'),
    emptyOutDir: true,
    target: 'node18',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'serverMain.mjs' } },
  },
  ssr: { target: 'node' },
})
