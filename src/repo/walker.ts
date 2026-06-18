import fs from 'node:fs';
import path from 'node:path';
import type { Layer } from '../config.js';

export interface KnowledgeFileRef {
  /** Path relative to repo root, using forward slashes. */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
  layer: Layer;
  domain: string;
  slug: string;
}

export interface SkillFileRef {
  relativePath: string;
  absolutePath: string;
  layer: Layer | 'global';
  group?: string;
  slug: string;
}

function walkDir(dir: string, predicate: (entry: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

const toRel = (repoPath: string, abs: string) => path.relative(repoPath, abs).split(path.sep).join('/');

export function listKnowledgeFiles(repoPath: string, layers: Layer[]): KnowledgeFileRef[] {
  const refs: KnowledgeFileRef[] = [];
  for (const layer of layers) {
    const layerKnowledge = path.join(repoPath, layer, 'knowledge');
    const mdFiles = walkDir(layerKnowledge, (f) => f.endsWith('.md'));
    for (const abs of mdFiles) {
      const rel = toRel(repoPath, abs);
      const parts = rel.split('/');
      // <layer>/knowledge/<domain>/<slug>.md
      if (parts.length < 4) continue;
      const domain = parts[2];
      const fileName = parts[parts.length - 1];
      const slug = fileName.replace(/\.md$/, '');
      refs.push({ relativePath: rel, absolutePath: abs, layer, domain, slug });
    }
  }
  return refs;
}

export function listSkillFiles(repoPath: string, layers: Layer[]): SkillFileRef[] {
  const refs: SkillFileRef[] = [];

  // Global meta-skills under /skills/
  const globalSkills = path.join(repoPath, 'skills');
  for (const abs of walkDir(globalSkills, (f) => f.endsWith('.md'))) {
    const rel = toRel(repoPath, abs);
    const parts = rel.split('/');
    const slug = parts[parts.length - 1].replace(/\.md$/, '');
    refs.push({ relativePath: rel, absolutePath: abs, layer: 'global', slug });
  }

  // Per-layer action skills under <layer>/skills/...
  for (const layer of layers) {
    const layerSkills = path.join(repoPath, layer, 'skills');
    for (const abs of walkDir(layerSkills, (f) => f.endsWith('.md'))) {
      const rel = toRel(repoPath, abs);
      const parts = rel.split('/');
      // <layer>/skills/<group?>/<slug>.md
      const slug = parts[parts.length - 1].replace(/\.md$/, '');
      const group = parts.length >= 4 ? parts[2] : undefined;
      refs.push({ relativePath: rel, absolutePath: abs, layer, group, slug });
    }
  }

  return refs;
}

export function findExampleFiles(knowledgeAbsPath: string): { good?: string; bad?: string } {
  const dir = path.dirname(knowledgeAbsPath);
  const baseSlug = path.basename(knowledgeAbsPath).replace(/\.md$/, '');
  const out: { good?: string; bad?: string } = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith(`${baseSlug}.good.`)) out.good = path.join(dir, entry);
    else if (entry.startsWith(`${baseSlug}.bad.`)) out.bad = path.join(dir, entry);
  }
  return out;
}
