import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKnowledgeFile, splitSections, descriptionExcerpt } from '../../src/parser/knowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  '..',
  'fixtures',
  'mini-repo',
  'microsoft',
  'knowledge',
  'performance',
  'use-isempty-for-existence-check.md',
);

describe('splitSections', () => {
  it('extracts Description, Best Practice, Anti Pattern under H2', () => {
    const body = `# Title\n\n## Description\nDesc body.\n\n## Best Practice\nBP body.\n\n## Anti Pattern\nAP body.\n\n## Other\nOther body.`;
    const out = splitSections(body);
    expect(out.description).toBe('Desc body.');
    expect(out.bestPractice).toBe('BP body.');
    expect(out.antiPattern).toBe('AP body.');
    expect(out.other).toEqual([{ heading: 'Other', body: 'Other body.' }]);
  });

  it('handles alternate anti-pattern spellings', () => {
    const out = splitSections(`## Anti-Pattern\nA\n\n## Best Practices\nB`);
    expect(out.antiPattern).toBe('A');
    expect(out.bestPractice).toBe('B');
  });

  it('returns empty sections when none present', () => {
    const out = splitSections(`# Just a title`);
    expect(out.description).toBeUndefined();
    expect(out.other).toEqual([]);
  });
});

describe('parseKnowledgeFile', () => {
  it('parses fixture frontmatter, title, and sections', () => {
    const k = parseKnowledgeFile(FIXTURE);
    expect(k.title).toBe('Use IsEmpty for existence checks');
    expect(k.frontmatter.domain).toBe('performance');
    expect(k.sections.description).toContain('IsEmpty');
    expect(k.sections.bestPractice).toContain('Use `IsEmpty()`');
    expect(k.sections.antiPattern).toContain('FindFirst()');
  });
});

describe('descriptionExcerpt', () => {
  it('returns trimmed first ≤ max chars of the description', () => {
    const k = parseKnowledgeFile(FIXTURE);
    const ex = descriptionExcerpt(k, 50);
    expect(ex.length).toBeLessThanOrEqual(50);
    expect(ex.startsWith('`Record.IsEmpty()`')).toBe(true);
  });
});
