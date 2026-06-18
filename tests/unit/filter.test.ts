import { describe, it, expect } from 'vitest';
import { matchesFilters } from '../../src/search/filter.js';
import type { KnowledgeEntry } from '../../src/repo/index.js';

function makeEntry(overrides: Partial<{
  layer: 'microsoft' | 'community' | 'custom';
  domain: string;
  keywords: string[];
  technologies: string[];
  bcVersion: ('all' | number | string)[] | 'all';
  countries: string[];
  applicationArea: string[];
}> = {}): KnowledgeEntry {
  const layer = overrides.layer ?? 'microsoft';
  const domain = overrides.domain ?? 'performance';
  return {
    ref: {
      relativePath: `${layer}/knowledge/${domain}/slug.md`,
      absolutePath: '',
      layer,
      domain,
      slug: 'slug',
    },
    parsed: {
      title: 'T',
      frontmatter: {
        'bc-version': (overrides.bcVersion as 'all' | (string | number)[]) ?? ['all'],
        domain,
        keywords: overrides.keywords ?? ['kw1', 'kw2'],
        technologies: overrides.technologies ?? ['al'],
        countries: overrides.countries ?? ['w1'],
        'application-area': overrides.applicationArea ?? ['all'],
      },
      sections: { other: [] },
      body: '',
      raw: '',
    },
  };
}

describe('matchesFilters', () => {
  it('matches on domain', () => {
    const e = makeEntry({ domain: 'security' });
    expect(matchesFilters(e, { domain: 'security' })).toBe(true);
    expect(matchesFilters(e, { domain: 'performance' })).toBe(false);
  });

  it('matches on layer', () => {
    const e = makeEntry({ layer: 'community' });
    expect(matchesFilters(e, { layer: 'community' })).toBe(true);
    expect(matchesFilters(e, { layer: 'microsoft' })).toBe(false);
  });

  it('matches on technologies intersection', () => {
    const e = makeEntry({ technologies: ['al'] });
    expect(matchesFilters(e, { technologies: ['al', 'powershell'] })).toBe(true);
    expect(matchesFilters(e, { technologies: ['python'] })).toBe(false);
  });

  it('matches on bcVersion explicit list', () => {
    const e = makeEntry({ bcVersion: [26, 27] });
    expect(matchesFilters(e, { bcVersion: 27 })).toBe(true);
    expect(matchesFilters(e, { bcVersion: 28 })).toBe(false);
  });

  it('matches on bcVersion ranges', () => {
    const e = makeEntry({ bcVersion: ['26..30'] });
    expect(matchesFilters(e, { bcVersion: 28 })).toBe(true);
    expect(matchesFilters(e, { bcVersion: 31 })).toBe(false);
  });

  it('w1 country is a wildcard', () => {
    const e = makeEntry({ countries: ['w1'] });
    expect(matchesFilters(e, { countries: ['de'] })).toBe(true);
  });

  it('non-w1 countries require intersection', () => {
    const e = makeEntry({ countries: ['de', 'fr'] });
    expect(matchesFilters(e, { countries: ['fr'] })).toBe(true);
    expect(matchesFilters(e, { countries: ['us'] })).toBe(false);
  });

  it('all in application-area is a wildcard', () => {
    const e = makeEntry({ applicationArea: ['all'] });
    expect(matchesFilters(e, { applicationArea: ['finance'] })).toBe(true);
  });

  it('keyword intersection', () => {
    const e = makeEntry({ keywords: ['isempty', 'existence'] });
    expect(matchesFilters(e, { keywords: ['existence'] })).toBe(true);
    expect(matchesFilters(e, { keywords: ['commit'] })).toBe(false);
  });
});
