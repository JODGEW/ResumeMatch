// Type shims for the two talisman submodules used by transcript correction.
// talisman ships as CommonJS (`module.exports = fn`) with no bundled types;
// Vite/esbuild handles the runtime CJS->ESM default-import interop, and these
// declarations satisfy the strict tsconfig. Keep the surface minimal — only the
// functions we actually import.

declare module 'talisman/phonetics/double-metaphone' {
  /** Returns the [primary, secondary] Double Metaphone codes for a word. */
  const doubleMetaphone: (word: string) => [string, string];
  export default doubleMetaphone;
}

declare module 'talisman/metrics/jaro-winkler' {
  /** Jaro-Winkler similarity in [0, 1]; 1 means identical. */
  const jaroWinkler: (a: string, b: string) => number;
  export default jaroWinkler;
}
