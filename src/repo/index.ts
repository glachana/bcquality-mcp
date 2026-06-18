import type { Layer } from '../config.js';
import type { KnowledgeFileRef, SkillFileRef } from './walker.js';
import { listKnowledgeFiles, listSkillFiles } from './walker.js';
import { safeParseKnowledgeFile, type ParsedKnowledge } from '../parser/knowledge.js';
import { safeParseSkillFile, type ParsedSkill } from '../parser/skill.js';

export interface KnowledgeEntry {
  ref: KnowledgeFileRef;
  parsed?: ParsedKnowledge;
  parseError?: string;
}

export interface SkillEntry {
  ref: SkillFileRef;
  parsed?: ParsedSkill;
  parseError?: string;
}

export interface KnowledgeIndex {
  knowledge: KnowledgeEntry[];
  skills: SkillEntry[];
  layers: Layer[];
  builtAt: Date;
}

export function buildIndex(repoPath: string, layers: Layer[]): KnowledgeIndex {
  const knowledgeRefs = listKnowledgeFiles(repoPath, layers);
  const skillRefs = listSkillFiles(repoPath, layers);

  const knowledge: KnowledgeEntry[] = knowledgeRefs.map((ref) => {
    const r = safeParseKnowledgeFile(ref.absolutePath);
    return r.ok ? { ref, parsed: r.value } : { ref, parseError: r.error };
  });

  const skills: SkillEntry[] = skillRefs.map((ref) => {
    const r = safeParseSkillFile(ref.absolutePath);
    return r.ok ? { ref, parsed: r.value } : { ref, parseError: r.error };
  });

  return { knowledge, skills, layers, builtAt: new Date() };
}

const LAYER_PRECEDENCE: Record<Layer | 'global', number> = {
  global: 0,
  microsoft: 1,
  community: 2,
  custom: 3,
};

/**
 * Pour deux fichiers de même `domain/slug`, garde la couche la plus prioritaire et
 * renvoie les écartés dans `suppressed[]`.
 */
export function applyLayerPrecedence(entries: KnowledgeEntry[]): {
  kept: KnowledgeEntry[];
  suppressed: Array<{ entry: KnowledgeEntry; supersededBy: KnowledgeEntry }>;
} {
  const byKey = new Map<string, KnowledgeEntry[]>();
  for (const e of entries) {
    const key = `${e.ref.domain}/${e.ref.slug}`;
    const arr = byKey.get(key) ?? [];
    arr.push(e);
    byKey.set(key, arr);
  }
  const kept: KnowledgeEntry[] = [];
  const suppressed: Array<{ entry: KnowledgeEntry; supersededBy: KnowledgeEntry }> = [];
  for (const arr of byKey.values()) {
    if (arr.length === 1) {
      kept.push(arr[0]);
      continue;
    }
    arr.sort((a, b) => LAYER_PRECEDENCE[b.ref.layer] - LAYER_PRECEDENCE[a.ref.layer]);
    kept.push(arr[0]);
    for (const e of arr.slice(1)) {
      suppressed.push({ entry: e, supersededBy: arr[0] });
    }
  }
  return { kept, suppressed };
}
