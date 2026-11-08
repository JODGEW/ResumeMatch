import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from './safeUrl';

describe('safeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(safeHttpUrl('http://example.com/jobs/1')).toBe('http://example.com/jobs/1');
    expect(safeHttpUrl('https://example.com/jobs/1')).toBe('https://example.com/jobs/1');
  });

  it('trims surrounding whitespace and returns the parsed href', () => {
    expect(safeHttpUrl('  https://example.com  ')).toBe('https://example.com/');
  });

  it('rejects javascript: in any casing or with leading space or embedded tab', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('  javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('java\tscript:alert(1)')).toBeUndefined();
  });

  it('rejects data:, vbscript: and mailto:', () => {
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHttpUrl('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeHttpUrl('mailto:someone@example.com')).toBeUndefined();
  });

  it('does not add a missing scheme', () => {
    expect(safeHttpUrl('www.example.com')).toBeUndefined();
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(safeHttpUrl('')).toBeUndefined();
    expect(safeHttpUrl('   ')).toBeUndefined();
  });

  it('rejects non-strings', () => {
    expect(safeHttpUrl(undefined)).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(42)).toBeUndefined();
    expect(safeHttpUrl({ href: 'https://example.com' })).toBeUndefined();
  });
});
