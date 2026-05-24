import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FREE_LIMITS, PRO_LIMITS } from './entitlements';
import type { PlanLimits } from '../types/entitlements';

// Resolved from THIS file, so it works regardless of cwd / where vitest runs.
const PY_PATH = new URL('../../aws/entitlements_constants.py', import.meta.url);

/** Pull the `{ ... }` literal assigned to `name` out of the Python source via a
 *  balanced-brace scan (robust to nesting and reformatting). */
function extractObjectLiteral(src: string, name: string): string {
  const assign = new RegExp(`(^|\\n)\\s*${name}\\s*=\\s*\\{`);
  const m = assign.exec(src);
  if (!m) {
    throw new Error(
      `entitlements-drift: could not find "${name} = {" in aws/entitlements_constants.py`,
    );
  }
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`entitlements-drift: unbalanced braces for "${name}"`);
}

/** Convert a pure-data Python dict literal into a JS object. The mirror file is
 *  declared "pure data, no logic", so we only handle int/bool literals,
 *  double-quoted keys, line comments, and trailing commas. */
function pyLiteralToObject(literal: string): unknown {
  const json = literal
    .replace(/#.*$/gm, '') //          strip line comments
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/,(\s*[}\]])/g, '$1'); // strip trailing commas
  return JSON.parse(json);
}

function parsePy(name: string): unknown {
  return pyLiteralToObject(extractObjectLiteral(readFileSync(PY_PATH, 'utf8'), name));
}

/** Flatten nested objects to dotted keys so we can report the exact diverging path. */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Compare TS limits against the Python mirror; return a list of human-readable
 *  divergences (empty = in sync). Catches missing keys in either direction. */
function drift(plan: string, ts: PlanLimits, py: unknown): string[] {
  const tsFlat = flatten(ts as unknown as Record<string, unknown>);
  const pyFlat = flatten(py as Record<string, unknown>);
  const keys = new Set([...Object.keys(tsFlat), ...Object.keys(pyFlat)]);
  const problems: string[] = [];
  for (const key of [...keys].sort()) {
    if (!(key in pyFlat)) {
      problems.push(`${plan}.${key}: in entitlements.ts but MISSING from entitlements_constants.py`);
    } else if (!(key in tsFlat)) {
      problems.push(`${plan}.${key}: in entitlements_constants.py but MISSING from entitlements.ts`);
    } else if (tsFlat[key] !== pyFlat[key]) {
      problems.push(
        `${plan}.${key}: entitlements.ts=${JSON.stringify(tsFlat[key])} ` +
          `vs entitlements_constants.py=${JSON.stringify(pyFlat[key])}`,
      );
    }
  }
  return problems;
}

describe('entitlements drift guard — src/utils/entitlements.ts vs aws/entitlements_constants.py', () => {
  it('FREE_LIMITS matches the Python mirror exactly', () => {
    const problems = drift('FREE_LIMITS', FREE_LIMITS, parsePy('FREE_LIMITS'));
    expect(
      problems,
      `\nFREE_LIMITS drift detected:\n  ${problems.join('\n  ')}\n` +
        `→ Reconcile aws/entitlements_constants.py with src/utils/entitlements.ts.`,
    ).toEqual([]);
  });

  it('PRO_LIMITS matches the Python mirror exactly', () => {
    const problems = drift('PRO_LIMITS', PRO_LIMITS, parsePy('PRO_LIMITS'));
    expect(
      problems,
      `\nPRO_LIMITS drift detected:\n  ${problems.join('\n  ')}\n` +
        `→ Reconcile aws/entitlements_constants.py with src/utils/entitlements.ts.`,
    ).toEqual([]);
  });
});
