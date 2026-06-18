import { describe, it, expect } from 'vitest';
import { scoreEntries } from '../../src/search/score.js';
import type { KnowledgeEntry } from '../../src/repo/index.js';

function entry(slug: string, opts: { keywords: string[]; title: string; description?: string; domain?: string }): KnowledgeEntry {
  const domain = opts.domain ?? 'performance';
  return {
    ref: {
      relativePath: `microsoft/knowledge/${domain}/${slug}.md`,
      absolutePath: '',
      layer: 'microsoft',
      domain,
      slug,
    },
    parsed: {
      title: opts.title,
      frontmatter: {
        'bc-version': ['all'],
        domain,
        keywords: opts.keywords,
        technologies: ['al'],
        countries: ['w1'],
        'application-area': ['all'],
      },
      sections: { description: opts.description, other: [] },
      body: '',
      raw: '',
    },
  };
}

describe('scoreEntries', () => {
  it('returns zero-score entries when query is empty', () => {
    const entries = [entry('a', { keywords: ['k'], title: 'A' })];
    const out = scoreEntries(entries, '');
    expect(out[0].score).toBe(0);
  });

  it('boosts exact keyword matches highest', () => {
    const entries = [
      entry('a', { keywords: ['isempty', 'existence-check'], title: 'About something', description: 'no kw' }),
      entry('b', { keywords: ['unrelated'], title: 'B', description: 'isempty appears here' }),
    ];
    const out = scoreEntries(entries, 'isempty');
    expect(out[0].entry.ref.slug).toBe('a');
    expect(out[0].matchedKeywords).toContain('isempty');
  });

  it('ranks higher when both keyword and title match', () => {
    const entries = [
      entry('a', { keywords: ['isempty'], title: 'About isempty', description: '' }),
      entry('b', { keywords: ['isempty'], title: 'Other', description: '' }),
    ];
    const out = scoreEntries(entries, 'isempty');
    expect(out[0].entry.ref.slug).toBe('a');
  });

  it('drops entries that match nothing', () => {
    const entries = [entry('a', { keywords: ['x'], title: 'X', description: 'y' })];
    expect(scoreEntries(entries, 'unrelated')).toHaveLength(0);
  });

  it('skips entries with no parsed frontmatter', () => {
    const entries: KnowledgeEntry[] = [{ ref: { relativePath: 'x', absolutePath: '', layer: 'microsoft', domain: 'd', slug: 's' } }];
    expect(scoreEntries(entries, 'anything')).toEqual([]);
  });
});
