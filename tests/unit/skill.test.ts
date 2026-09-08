import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFile } from '../../src/parser/skill.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'fixtures', 'mini-repo');

describe('parseSkillFile', () => {
  it('classifies meta skills (skills/entry.md) as kind=meta', () => {
    const s = parseSkillFile(path.join(ROOT, 'skills', 'entry.md'));
    expect(s.kind).toBe('meta');
    expect(s.title).toBe('Entry — routing meta skill');
  });

  it('classifies skills/<name>/SKILL.md as kind=host-skill', () => {
    const s = parseSkillFile(path.join(ROOT, 'skills', 'al-code-review', 'SKILL.md'));
    expect(s.kind).toBe('host-skill');
    const fm = s.frontmatter as { name: string; description: string };
    expect(fm.name).toBe('al-code-review');
    expect(fm.description).toContain('BCQuality');
    expect(s.title).toBe('AL code review');
  });

  it('parses action-skill frontmatter under microsoft/skills', () => {
    const s = parseSkillFile(
      path.join(ROOT, 'microsoft', 'skills', 'review', 'al-performance-review.md'),
    );
    expect(s.kind).toBe('action-skill');
    const fm = s.frontmatter as { id: string; inputs: string[]; outputs: string[] };
    expect(fm.id).toBe('al-performance-review');
    expect(fm.inputs).toEqual(['pr-diff']);
    expect(fm.outputs).toEqual(['findings-report']);
  });
});
