import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import {
  ActionSkillFrontmatterSchema,
  HostSkillFrontmatterSchema,
  type ActionSkillFrontmatter,
  type HostSkillFrontmatter,
} from './frontmatter.js';

export type SkillKind = 'action-skill' | 'host-skill' | 'meta';

export interface ParsedSkill {
  kind: SkillKind;
  frontmatter: ActionSkillFrontmatter | HostSkillFrontmatter | Record<string, unknown>;
  title: string;
  body: string;
  raw: string;
}

export function parseSkillFile(absolutePath: string): ParsedSkill {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = matter(raw);

  const fmData = parsed.data ?? {};
  const isAction = (fmData as Record<string, unknown>).kind === 'action-skill';
  // Convention BCQuality: skills/<name>/SKILL.md est un adaptateur au format hôte.
  const isHost = !isAction && path.basename(absolutePath) === 'SKILL.md';

  const h1 = parsed.content.match(/^#\s+(.+?)\s*$/m);
  const title = h1 ? h1[1].trim() : '';

  if (isAction) {
    const fm = ActionSkillFrontmatterSchema.parse(fmData);
    return { kind: 'action-skill', frontmatter: fm, title, body: parsed.content, raw };
  }
  if (isHost) {
    const fm = HostSkillFrontmatterSchema.parse(fmData);
    return { kind: 'host-skill', frontmatter: fm, title, body: parsed.content, raw };
  }
  return {
    kind: 'meta',
    frontmatter: fmData as Record<string, unknown>,
    title,
    body: parsed.content,
    raw,
  };
}

export function safeParseSkillFile(
  absolutePath: string,
): { ok: true; value: ParsedSkill } | { ok: false; error: string } {
  try {
    return { ok: true, value: parseSkillFile(absolutePath) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
