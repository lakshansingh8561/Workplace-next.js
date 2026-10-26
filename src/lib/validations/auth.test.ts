// src/lib/validations/auth.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeRedirectPath } from './auth';
import { isSafeHttpUrl } from './profile';

describe('sanitizeRedirectPath', () => {
  it('allows safe relative paths', () => {
    const path = '/dashboard';
    expect(sanitizeRedirectPath(path)).toBe(path);
  });

  it('rejects external URLs', () => {
    const unsafe = ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)'];
    for (const u of unsafe) {
      expect(sanitizeRedirectPath(u)).toBe('/jobs');
    }
  });
});

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
    expect(isSafeHttpUrl('https://example.com')).toBe(true);
  });

  it('rejects unsafe protocols', () => {
    const bad = ['javascript:alert(1)', 'data:text/html,', 'ftp://example.com'];
    for (const u of bad) {
      expect(isSafeHttpUrl(u)).toBe(false);
    }
  });
});
