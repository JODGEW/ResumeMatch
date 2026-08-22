import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** Bundles the evaluation runner to ESM, for the same reason the investigation server is bundled. */
export default defineConfig({
  root: repositoryRoot,
  build: {
    ssr: path.join(repositoryRoot, 'qa/investigation/evalRunner/main.ts'),
    outDir: path.join(repositoryRoot, '.qa-artifacts', 'evaluation-runtime'),
    emptyOutDir: true,
    target: 'node18',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'main.mjs' } },
  },
  ssr: { target: 'node' },
})
