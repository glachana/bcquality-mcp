import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, applyLayerPrecedence } from '../../src/repo/index.js';
import { findExampleFiles } from '../../src/repo/walker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', 'fixtures', 'mini-repo');

describe('buildIndex against fixture repo', () => {
  it('discovers knowledge files across active layers', () => {
    const idx = buildIndex(REPO, ['microsoft', 'community', 'custom']);
    const ms = idx.knowledge.filter((e) => e.ref.layer === 'microsoft');
    const co = idx.knowledge.filter((e) => e.ref.layer === 'community');
    const cu = idx.knowledge.filter((e) => e.ref.layer === 'custom');
    expect(ms.length).toBeGreaterThanOrEqual(3);
    expect(co.length).toBe(1);
    expect(cu.length).toBe(1);
  });

  it('parses frontmatter without errors on valid files', () => {
    const idx = buildIndex(REPO, ['microsoft']);
    expect(idx.knowledge.every((e) => e.parsed)).toBe(true);
    expect(idx.knowledge.some((e) => e.parseError)).toBe(false);
  });

  it('discovers skills including global meta-skills', () => {
    const idx = buildIndex(REPO, ['microsoft']);
    const layers = new Set(idx.skills.map((s) => s.ref.layer));
    expect(layers.has('global')).toBe(true);
    expect(layers.has('microsoft')).toBe(true);
  });

  it('classifies skill kinds (meta vs action-skill)', () => {
    const idx = buildIndex(REPO, ['microsoft']);
    const action = idx.skills.find((s) => s.parsed?.kind === 'action-skill');
    expect(action?.ref.slug).toBe('al-performance-review');
    const meta = idx.skills.find((s) => s.ref.slug === 'entry');
    expect(meta?.parsed?.kind).toBe('meta');
  });

  it('honors the layers parameter', () => {
    const idx = buildIndex(REPO, ['microsoft']);
    expect(idx.knowledge.every((e) => e.ref.layer === 'microsoft')).toBe(true);
  });
});

describe('applyLayerPrecedence', () => {
  it('keeps the custom layer over community over microsoft for the same slug', () => {
    const idx = buildIndex(REPO, ['microsoft', 'community', 'custom']);
    const sameSlug = idx.knowledge.filter((e) => e.ref.slug === 'use-isempty-for-existence-check');
    expect(sameSlug).toHaveLength(3);

    const { kept, suppressed } = applyLayerPrecedence(sameSlug);
    expect(kept).toHaveLength(1);
    expect(kept[0].ref.layer).toBe('custom');
    expect(suppressed).toHaveLength(2);
    const supLayers = suppressed.map((s) => s.entry.ref.layer).sort();
    expect(supLayers).toEqual(['community', 'microsoft']);
  });

  it('keeps unique slugs as-is', () => {
    const idx = buildIndex(REPO, ['microsoft']);
    const commit = idx.knowledge.find((e) => e.ref.slug === 'avoid-commit-inside-loops');
    expect(commit).toBeDefined();
    const { kept, suppressed } = applyLayerPrecedence([commit!]);
    expect(kept).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
  });
});

describe('findExampleFiles', () => {
  it('locates sibling .good.al and .bad.al', () => {
    const mdPath = path.join(
      REPO,
      'microsoft',
      'knowledge',
      'performance',
      'use-isempty-for-existence-check.md',
    );
    const ex = findExampleFiles(mdPath);
    expect(ex.good).toBeDefined();
    expect(ex.bad).toBeDefined();
    expect(ex.good!.endsWith('use-isempty-for-existence-check.good.al')).toBe(true);
    expect(ex.bad!.endsWith('use-isempty-for-existence-check.bad.al')).toBe(true);
  });

  it('returns undefined when no examples exist', () => {
    const mdPath = path.join(REPO, 'microsoft', 'knowledge', 'security', 'classify-every-field.md');
    const ex = findExampleFiles(mdPath);
    expect(ex.good).toBeUndefined();
    expect(ex.bad).toBeUndefined();
  });
});
