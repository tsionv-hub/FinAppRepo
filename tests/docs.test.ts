import { describe, expect, it } from 'vitest';
import { docsUrl } from '../src/docs';

describe('guide links', () => {
  it('point at the repository the site is published from', () => {
    expect(docsUrl('MANUAL.md', { hostname: 'someone.github.io', pathname: '/MyRepo/' })).toBe('https://github.com/someone/MyRepo/blob/main/docs/MANUAL.md');
    expect(docsUrl('MANUAL.he.md', { hostname: 'someone.github.io', pathname: '/MyRepo/index.html' })).toBe('https://github.com/someone/MyRepo/blob/main/docs/MANUAL.he.md');
  });
  it('are hidden on other hosts', () => {
    expect(docsUrl('MANUAL.md', { hostname: 'localhost', pathname: '/' })).toBeNull();
    expect(docsUrl('MANUAL.md', { hostname: 'someone.github.io', pathname: '/' })).toBeNull();
  });
});
