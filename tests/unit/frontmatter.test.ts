import { describe, it, expect } from 'vitest';
import {
  KnowledgeFrontmatterSchema,
  ActionSkillFrontmatterSchema,
  bcVersionMatches,
  normalizeBcVersion,
} from '../../src/parser/frontmatter.js';

describe('KnowledgeFrontmatterSchema', () => {
  it('accepts the canonical 6-field frontmatter', () => {
    const fm = KnowledgeFrontmatterSchema.parse({
      'bc-version': ['all'],
      domain: 'performance',
      keywords: ['isempty', 'existence-check', 'findfirst'],
      technologies: ['al'],
      countries: ['w1'],
      'application-area': ['all'],
    });
    expect(fm.domain).toBe('performance');
    expect(fm.keywords).toContain('isempty');
  });

  it('accepts numeric and range bc-version entries', () => {
    const fm = KnowledgeFrontmatterSchema.parse({
      'bc-version': [26, 27, '28..30'],
      domain: 'performance',
      keywords: ['commit', 'loop'],
      technologies: ['al'],
      countries: ['w1'],
      'application-area': ['all'],
    });
    expect(fm['bc-version']).toEqual([26, 27, '28..30']);
  });

  it('rejects missing required fields', () => {
    expect(() =>
      KnowledgeFrontmatterSchema.parse({
        'bc-version': ['all'],
        domain: 'performance',
        // keywords missing
        technologies: ['al'],
        countries: ['w1'],
        'application-area': ['all'],
      }),
    ).toThrow();
  });

  it('rejects empty keywords array', () => {
    expect(() =>
      KnowledgeFrontmatterSchema.parse({
        'bc-version': ['all'],
        domain: 'performance',
        keywords: [],
        technologies: ['al'],
        countries: ['w1'],
        'application-area': ['all'],
      }),
    ).toThrow();
  });
});

describe('ActionSkillFrontmatterSchema', () => {
  it('accepts a complete action-skill frontmatter', () => {
    const fm = ActionSkillFrontmatterSchema.parse({
      kind: 'action-skill',
      id: 'al-performance-review',
      version: 1,
      title: 'AL performance review',
      description: 'Reviews AL code.',
      inputs: ['pr-diff'],
      outputs: ['findings-report'],
      'sub-skills': ['microsoft/skills/review/al-style-review.md'],
    });
    expect(fm.id).toBe('al-performance-review');
    expect(fm['sub-skills']).toHaveLength(1);
  });

  it('rejects when kind is not action-skill', () => {
    expect(() =>
      ActionSkillFrontmatterSchema.parse({
        kind: 'meta-skill',
        id: 'foo',
        version: 1,
        title: 't',
        description: 'd',
        inputs: ['pr-diff'],
        outputs: ['findings-report'],
      }),
    ).toThrow();
  });
});

describe('normalizeBcVersion', () => {
  it('returns ["all"] for "all"', () => {
    expect(normalizeBcVersion('all')).toEqual(['all']);
  });

  it('stringifies numeric entries', () => {
    expect(normalizeBcVersion([26, 27, '28..30'])).toEqual(['26', '27', '28..30']);
  });
});

describe('bcVersionMatches', () => {
  it('returns true when undefined version requested', () => {
    expect(bcVersionMatches(['26'], undefined)).toBe(true);
  });

  it('matches "all" against any requested version', () => {
    expect(bcVersionMatches(['all'], 27)).toBe(true);
    expect(bcVersionMatches(['all'], '28')).toBe(true);
  });

  it('matches exact version', () => {
    expect(bcVersionMatches(['26', '27'], 27)).toBe(true);
    expect(bcVersionMatches(['26', '27'], 28)).toBe(false);
  });

  it('matches ranges like 26..28', () => {
    expect(bcVersionMatches(['26..28'], 27)).toBe(true);
    expect(bcVersionMatches(['26..28'], 25)).toBe(false);
    expect(bcVersionMatches(['26..28'], 29)).toBe(false);
  });
});
