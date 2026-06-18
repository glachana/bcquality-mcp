import fs from 'node:fs';
import matter from 'gray-matter';
import { KnowledgeFrontmatterSchema, type KnowledgeFrontmatter } from './frontmatter.js';

export interface KnowledgeSections {
  description?: string;
  bestPractice?: string;
  antiPattern?: string;
  other: Array<{ heading: string; body: string }>;
}

export interface ParsedKnowledge {
  frontmatter: KnowledgeFrontmatter;
  title: string;
  sections: KnowledgeSections;
  body: string;
  raw: string;
}

const HEADING_MAP: Record<string, keyof Pick<KnowledgeSections, 'description' | 'bestPractice' | 'antiPattern'>> = {
  description: 'description',
  'best practice': 'bestPractice',
  'best practices': 'bestPractice',
  'anti pattern': 'antiPattern',
  'anti-pattern': 'antiPattern',
  'anti patterns': 'antiPattern',
  'anti-patterns': 'antiPattern',
};

export function splitSections(body: string): KnowledgeSections {
  const lines = body.split(/\r?\n/);
  const sections: KnowledgeSections = { other: [] };

  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    const text = buffer.join('\n').trim();
    if (!text) {
      buffer = [];
      return;
    }
    const key = HEADING_MAP[currentHeading.toLowerCase()];
    if (key) {
      sections[key] = text;
    } else {
      sections.other.push({ heading: currentHeading, body: text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      currentHeading = h2[1].trim();
      continue;
    }
    if (currentHeading !== null) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

export function parseKnowledgeFile(absolutePath: string): ParsedKnowledge {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = matter(raw);
  const frontmatter = KnowledgeFrontmatterSchema.parse(parsed.data);

  // H1 title — fallback to slug.
  const h1 = parsed.content.match(/^#\s+(.+?)\s*$/m);
  const title = h1 ? h1[1].trim() : '';

  const sections = splitSections(parsed.content);

  return {
    frontmatter,
    title,
    sections,
    body: parsed.content,
    raw,
  };
}

export function safeParseKnowledgeFile(
  absolutePath: string,
): { ok: true; value: ParsedKnowledge } | { ok: false; error: string } {
  try {
    return { ok: true, value: parseKnowledgeFile(absolutePath) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function descriptionExcerpt(parsed: ParsedKnowledge, max = 200): string {
  const source = parsed.sections.description ?? parsed.body;
  const flat = source.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.substring(0, max - 1)}…`;
}
