import fs from 'node:fs';
import matter from 'gray-matter';
import { ActionSkillFrontmatterSchema, type ActionSkillFrontmatter } from './frontmatter.js';

export interface ParsedSkill {
  kind: 'action-skill' | 'meta';
  frontmatter: ActionSkillFrontmatter | Record<string, unknown>;
  title: string;
  body: string;
  raw: string;
}

export function parseSkillFile(absolutePath: string): ParsedSkill {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = matter(raw);

  const fmData = parsed.data ?? {};
  const isAction = (fmData as Record<string, unknown>).kind === 'action-skill';

  const h1 = parsed.content.match(/^#\s+(.+?)\s*$/m);
  const title = h1 ? h1[1].trim() : '';

  if (isAction) {
    const fm = ActionSkillFrontmatterSchema.parse(fmData);
    return { kind: 'action-skill', frontmatter: fm, title, body: parsed.content, raw };
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
